import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Tool, TrackerOp } from '../../shared/schemas'
import { ManifestSchema } from '../../shared/schemas'
import { getCatalogPath } from '../catalog/paths'
import { readTracker, withTrackerLock, writeTracker } from '../state/tracker'
import { copyFile, hashFile } from './fs-utils'

export interface ManagerStatus {
  present: boolean
  catalogVersion: string | null
  installed: Record<
    Tool,
    {
      installed: boolean
      path: string
      version: string | null
      slashCommandInstalled?: boolean
      slashCommandPath?: string
    }
  >
}

/**
 * One install asset = one source/dest pair for a tool.
 * Manager install produces:
 *  - Claude:   agent file + slash command file   (2 assets)
 *  - Opencode: agent file only                    (1 asset)
 */
interface ManagerAsset {
  kind: 'agent' | 'slash-command'
  src: string
  dst: string
}

function managerAssets(catalogPath: string, version: string, tool: Tool): ManagerAsset[] {
  const home = os.homedir()
  const agent: ManagerAsset = {
    kind: 'agent',
    src: path.join(catalogPath, 'manager', `v${version}`, tool, 'manager.md'),
    dst:
      tool === 'claude'
        ? path.join(home, '.claude', 'agents', 'manager.md')
        : path.join(home, '.config', 'opencode', 'agents', 'manager.md'),
  }

  if (tool !== 'claude') return [agent]

  // Claude-only: slash command file that lets the user invoke the
  // manager via `/manager`. Opencode has no slash commands.
  const slash: ManagerAsset = {
    kind: 'slash-command',
    src: path.join(catalogPath, 'manager', `v${version}`, 'claude', 'slash-command.md'),
    dst: path.join(home, '.claude', 'commands', 'manager.md'),
  }
  return [agent, slash]
}

function managerAgentDest(tool: Tool): string {
  const home = os.homedir()
  return tool === 'claude'
    ? path.join(home, '.claude', 'agents', 'manager.md')
    : path.join(home, '.config', 'opencode', 'agents', 'manager.md')
}

function claudeSlashCommandDest(): string {
  return path.join(os.homedir(), '.claude', 'commands', 'manager.md')
}

async function readManagerManifest(catalogPath: string) {
  const manifestPath = path.join(catalogPath, 'manager', 'manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    const raw = await fs.readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = ManifestSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export async function getManagerStatus(): Promise<ManagerStatus> {
  const catalogPath = getCatalogPath()
  const manifest = await readManagerManifest(catalogPath)
  const catalogVersion = manifest?.activeVersion ?? null

  const tracker = await readTracker(catalogPath)

  const statusFor = (tool: Tool) => {
    const agentDest = managerAgentDest(tool)
    const trackerEntry = tracker.operations.find(
      (o) =>
        o.customType === 'agent' &&
        o.customId === 'manager' &&
        o.tool === tool &&
        o.toPath === agentDest,
    )
    const base = {
      installed: existsSync(agentDest),
      path: agentDest,
      version: trackerEntry?.version ?? null,
    }

    if (tool !== 'claude') return base

    const slashDest = claudeSlashCommandDest()
    return {
      ...base,
      slashCommandInstalled: existsSync(slashDest),
      slashCommandPath: slashDest,
    }
  }

  return {
    present: manifest !== null,
    catalogVersion,
    installed: {
      claude: statusFor('claude'),
      opencode: statusFor('opencode'),
    },
  }
}

export interface InstallManagerResult {
  installed: Array<{ tool: Tool; path: string; version: string; kind: 'agent' | 'slash-command' }>
  skipped: Array<{ tool: Tool; reason: string }>
}

export async function installManager(tools: Tool[]): Promise<InstallManagerResult> {
  const catalogPath = getCatalogPath()
  return withTrackerLock(catalogPath, () => installManagerImpl(catalogPath, tools))
}

async function installManagerImpl(catalogPath: string, tools: Tool[]): Promise<InstallManagerResult> {
  const manifest = await readManagerManifest(catalogPath)
  if (!manifest) throw new Error('manager manifest not found in catalog')
  const version = manifest.activeVersion

  const installed: InstallManagerResult['installed'] = []
  const skipped: InstallManagerResult['skipped'] = []
  const now = new Date().toISOString()

  // Expand each tool into its assets (1 for Opencode, 2 for Claude).
  const plannedAssets: Array<{ tool: Tool; asset: ManagerAsset }> = tools.flatMap((tool) =>
    managerAssets(catalogPath, version, tool).map((asset) => ({ tool, asset })),
  )

  // Path-scheme migration: clean up old tracker entries whose toPath
  // points at a path NO LONGER produced by managerAssets() (e.g.,
  // singular `.opencode/agent/manager.md` from before the plural
  // migration). Without this, those files would persist on disk as
  // orphans after a fresh install at the new path.
  const tracker = await readTracker(catalogPath)
  const newDsts = new Set(plannedAssets.map(({ asset }) => asset.dst))
  for (const op of tracker.operations) {
    if (op.customType !== 'agent' || op.customId !== 'manager') continue
    if (op.type !== 'copy') continue
    if (newDsts.has(op.toPath)) continue
    if (existsSync(op.toPath)) {
      await fs.unlink(op.toPath).catch(() => undefined)
    }
  }

  // Snapshot any pre-existing destination content for rollback.
  const previousSnapshot = new Map<string, string>()
  for (const { asset } of plannedAssets) {
    if (existsSync(asset.dst)) {
      previousSnapshot.set(asset.dst, await fs.readFile(asset.dst, 'utf8'))
    }
  }

  const stagedOps: TrackerOp[] = []
  const copiedPaths: string[] = []

  try {
    for (const { tool, asset } of plannedAssets) {
      if (!existsSync(asset.src)) {
        skipped.push({
          tool,
          reason: `${asset.kind} source file not found: ${asset.src}`,
        })
        continue
      }
      // Guard against symlink misconfiguration (src === dst).
      const [srcReal, dstReal] = await Promise.all([
        fs.realpath(asset.src).catch(() => path.resolve(asset.src)),
        fs.realpath(asset.dst).catch(() => path.resolve(asset.dst)),
      ])
      if (srcReal === dstReal) {
        skipped.push({
          tool,
          reason: `${asset.kind} source and destination resolve to the same path (${srcReal}) — symlink misconfig?`,
        })
        continue
      }

      await copyFile(asset.src, asset.dst)
      copiedPaths.push(asset.dst)

      stagedOps.push({
        opId: randomUUID(),
        type: 'copy',
        customId: 'manager',
        customType: 'agent',
        version,
        tool,
        target: { scope: 'global' },
        toPath: asset.dst,
        fromPath: asset.src,
        contentHash: await hashFile(asset.dst),
        installedAt: now,
      })
      installed.push({ tool, path: asset.dst, version, kind: asset.kind })
    }
  } catch (err) {
    // Rollback: restore prior content or delete files that didn't
    // exist before. Tracker is untouched.
    for (const p of copiedPaths) {
      const prev = previousSnapshot.get(p)
      try {
        if (prev !== undefined) {
          await fs.writeFile(p, prev, 'utf8')
        } else if (existsSync(p)) {
          await fs.unlink(p)
        }
      } catch (rollbackErr) {
        console.error(
          `[ai-customizer] manager install rollback failed at ${p}: ${rollbackErr instanceof Error ? rollbackErr.message : rollbackErr}`,
        )
      }
    }
    console.error(
      `[ai-customizer] manager install failed (rollback attempted): ${err instanceof Error ? err.message : err}`,
    )
    throw err
  }

  // All copies succeeded — commit tracker in a single atomic write.
  // Reuse the `tracker` we read at the top of this function (for the
  // path-scheme migration) instead of re-reading. Within the
  // `withTrackerLock` boundary nobody else writes to this file.
  tracker.operations = tracker.operations.filter(
    (o) => !(o.customType === 'agent' && o.customId === 'manager'),
  )
  tracker.operations.push(...stagedOps)
  tracker.catalogPath = catalogPath
  tracker.lastApply = now
  await writeTracker(tracker)

  return { installed, skipped }
}

export async function uninstallManager(): Promise<{ removed: Array<{ tool: Tool; path: string }> }> {
  const catalogPath = getCatalogPath()
  return withTrackerLock(catalogPath, () => uninstallManagerImpl(catalogPath))
}

async function uninstallManagerImpl(
  catalogPath: string,
): Promise<{ removed: Array<{ tool: Tool; path: string }> }> {
  const tracker = await readTracker(catalogPath)
  const removed: Array<{ tool: Tool; path: string }> = []

  // All manager tracker ops — both agent and slash-command entries for
  // Claude, just the agent for Opencode.
  const entries = tracker.operations.filter(
    (o) => o.customType === 'agent' && o.customId === 'manager',
  )
  for (const e of entries) {
    if (existsSync(e.toPath)) {
      await fs.unlink(e.toPath).catch(() => undefined)
    }
    removed.push({ tool: e.tool, path: e.toPath })
  }

  tracker.operations = tracker.operations.filter(
    (o) => !(o.customType === 'agent' && o.customId === 'manager'),
  )
  tracker.catalogPath = catalogPath
  await writeTracker(tracker)
  return { removed }
}
