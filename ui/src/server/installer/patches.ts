import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ApplicationGuide, GuideEntry, PatchMasterName, Tool } from '../../shared/schemas'

export interface ComposedPatchResult {
  content: string
  contentHash: string
  activeGuideHash: string
  appliedEntries: GuideEntry[]
}

export interface PatchCompositionError {
  code: 'before-not-found'
  patchId: string
  version: string
  message: string
}

export function toolFor(target: PatchMasterName): Tool {
  return target === 'CLAUDE.md' ? 'claude' : 'opencode'
}

export function globalMasterPath(target: PatchMasterName): string {
  const home = os.homedir()
  return target === 'CLAUDE.md'
    ? path.join(home, '.claude', 'CLAUDE.md')
    : path.join(home, '.config', 'opencode', 'AGENTS.md')
}

export function originalBackupPath(masterPath: string): string {
  return `${masterPath}.original`
}

function hashString(s: string): string {
  return 'sha256:' + createHash('sha256').update(s).digest('hex')
}

export function activeGuideHashFor(activeEntries: GuideEntry[]): string {
  const normalized = activeEntries
    .filter((e) => e.active)
    .sort((a, b) => a.order - b.order)
    .map((e) => `${e.patchId}@${e.version}#${e.order}`)
    .join('|')
  return hashString(normalized)
}

export function activeEntriesFor(guide: ApplicationGuide, target: PatchMasterName): GuideEntry[] {
  return guide.targets[target].filter((e) => e.active).sort((a, b) => a.order - b.order)
}

async function readPatchPair(
  catalogPath: string,
  patchId: string,
  version: string,
  tool: Tool,
): Promise<{ before: string; after: string } | { error: string }> {
  const dir = path.join(catalogPath, 'customizations', 'patches', patchId, `v${version}`, tool)
  const beforePath = path.join(dir, 'before.md')
  const afterPath = path.join(dir, 'after.md')
  if (!existsSync(beforePath) || !existsSync(afterPath)) {
    return { error: `patch files missing for ${patchId} v${version} (${tool})` }
  }
  const [before, after] = await Promise.all([
    fs.readFile(beforePath, 'utf8'),
    fs.readFile(afterPath, 'utf8'),
  ])
  return { before, after }
}

/**
 * Compose the final master content by applying each active entry in
 * order as a find-and-replace on the baseline.
 *
 * @param baseline The `.original` content (or current master if no
 *   `.original` exists yet — executor snapshots the first time).
 */
export async function composePatches(params: {
  catalogPath: string
  baseline: string
  target: PatchMasterName
  entries: GuideEntry[]
}): Promise<ComposedPatchResult | PatchCompositionError> {
  const tool = toolFor(params.target)
  let working = params.baseline
  const applied: GuideEntry[] = []

  for (const entry of params.entries) {
    const pair = await readPatchPair(params.catalogPath, entry.patchId, entry.version, tool)
    if ('error' in pair) {
      return {
        code: 'before-not-found',
        patchId: entry.patchId,
        version: entry.version,
        message: pair.error,
      }
    }
    const idx = working.indexOf(pair.before)
    if (idx === -1) {
      return {
        code: 'before-not-found',
        patchId: entry.patchId,
        version: entry.version,
        message: `patch ${entry.patchId} v${entry.version}: before.md not found in master (probable conflict with a prior patch)`,
      }
    }
    working = working.slice(0, idx) + pair.after + working.slice(idx + pair.before.length)
    applied.push(entry)
  }

  return {
    content: working,
    contentHash: hashString(working),
    activeGuideHash: activeGuideHashFor(params.entries),
    appliedEntries: applied,
  }
}

/**
 * Execute a patch-apply for a single master target.
 * - Snapshots `.original` if absent.
 * - Composes patches over `.original`.
 * - Writes result to master path.
 * Throws on composition failure.
 */
export async function executePatchApply(params: {
  catalogPath: string
  target: PatchMasterName
  guide: ApplicationGuide
}): Promise<{
  masterPath: string
  originalBackup: string
  activeGuideHash: string
  appliedContentHash: string
  skipped: boolean
}> {
  const masterPath = globalMasterPath(params.target)
  const origPath = originalBackupPath(masterPath)
  const entries = activeEntriesFor(params.guide, params.target)

  const masterExists = existsSync(masterPath)
  const originalExists = existsSync(origPath)

  if (!masterExists && !originalExists) {
    // Nothing to patch and no baseline — skip. The user must have a
    // master file for patches to apply.
    return {
      masterPath,
      originalBackup: origPath,
      activeGuideHash: activeGuideHashFor(entries),
      appliedContentHash: '',
      skipped: true,
    }
  }

  // Ensure .original exists (snapshot current master on first apply).
  if (!originalExists) {
    await fs.copyFile(masterPath, origPath)
  }

  const baseline = await fs.readFile(origPath, 'utf8')

  if (entries.length === 0) {
    // No active entries — restore master to .original content.
    await fs.writeFile(masterPath, baseline, 'utf8')
    return {
      masterPath,
      originalBackup: origPath,
      activeGuideHash: activeGuideHashFor(entries),
      appliedContentHash: hashString(baseline),
      skipped: false,
    }
  }

  const composed = await composePatches({
    catalogPath: params.catalogPath,
    baseline,
    target: params.target,
    entries,
  })

  if ('code' in composed) {
    throw new Error(
      `patch composition failed for ${params.target}: ${composed.message}`,
    )
  }

  await fs.writeFile(masterPath, composed.content, 'utf8')

  return {
    masterPath,
    originalBackup: origPath,
    activeGuideHash: composed.activeGuideHash,
    appliedContentHash: composed.contentHash,
    skipped: false,
  }
}

/**
 * Restore a master file from its `.original`.
 *
 * Note on `.original` persistence: we intentionally KEEP the
 * `.original` file after restoration. It is the canonical baseline
 * that all future patch applications start from — deleting it would
 * mean the next patch install snapshots whatever the user's master
 * happens to be at that moment, which may include manual edits or
 * other tools' modifications. Keeping `.original` frozen gives
 * deterministic patch composition across install/uninstall cycles.
 *
 * The user can delete `.original` manually if they want to "rebase"
 * onto a new baseline (e.g., after a gentle-ai upgrade changed their
 * master). It's a sidecar file, unmanaged by the installer once it
 * exists.
 */
export async function restoreFromOriginal(masterPath: string): Promise<void> {
  const origPath = originalBackupPath(masterPath)
  if (!existsSync(origPath)) return
  await fs.copyFile(origPath, masterPath)
}
