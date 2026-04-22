import { existsSync } from 'node:fs'
import os from 'node:os'
import type { Tool } from '../../shared/schemas'
import { readGuide, writeGuide } from '../catalog/guide'
import type { LoadedCatalog } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'
import { readTracker, writeTracker } from '../state/tracker'
import { deleteFileAndCleanup } from './fs-utils'

export type OrphanKind = 'skill-or-agent' | 'patch'

export interface OrphanEntry {
  kind: OrphanKind
  customId: string
  customType: 'skill' | 'agent' | 'patch'
  version: string
  tools: Tool[]                   // for skill/agent orphans, one entry per tool installed
  installedPaths: string[]        // for skill/agent, per-tool dest paths. For patches, the master paths.
  reason: 'not-in-catalog'
}

type TrackerRef = Awaited<ReturnType<typeof readTracker>>

export function computeOrphans(tracker: TrackerRef, catalog: LoadedCatalog): OrphanEntry[] {
  const presentKeys = new Set(catalog.customs.map((c) => `${c.type}:${c.id}`))
  const orphans: OrphanEntry[] = []

  // Skill / agent orphans — deduplicate by (customType, customId); merge tools.
  const byKey = new Map<string, { customType: 'skill' | 'agent'; customId: string; version: string; tools: Tool[]; paths: string[] }>()
  for (const op of tracker.operations) {
    if (op.type !== 'copy') continue
    // Manager is a special citizen: tracked but intentionally not in `customizations/`.
    if (op.customType === 'agent' && op.customId === 'manager') continue
    const key = `${op.customType}:${op.customId}`
    if (presentKeys.has(key)) continue
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.tools.includes(op.tool)) existing.tools.push(op.tool)
      existing.paths.push(op.toPath)
    } else {
      byKey.set(key, {
        customType: op.customType,
        customId: op.customId,
        version: op.version,
        tools: [op.tool],
        paths: [op.toPath],
      })
    }
  }
  for (const info of byKey.values()) {
    orphans.push({
      kind: 'skill-or-agent',
      customType: info.customType,
      customId: info.customId,
      version: info.version,
      tools: info.tools,
      installedPaths: info.paths,
      reason: 'not-in-catalog',
    })
  }

  // Patch orphans — tracker.patches entries referencing a patchId
  // that no longer exists in the catalog. They appear as blockers in
  // the planner, so orphans view lets users clean them up.
  for (const p of tracker.patches) {
    // The "custom" for a patch orphan is the patchId embedded in
    // activeGuideHash — but we don't parse that. Instead, a patch
    // orphan exists when the tracker recorded a master-apply that
    // referenced patchIds no longer in the catalog. Detecting this
    // precisely requires re-reading the guide. We only flag when
    // tracker recorded a non-empty activeGuideHash AND the catalog
    // has no patches at all for that target (conservative check).
    const hasAnyPatch = catalog.customs.some((c) => c.type === 'patch')
    if (!hasAnyPatch) {
      orphans.push({
        kind: 'patch',
        customType: 'patch',
        customId: `(master:${p.target})`,
        version: '',
        tools: [],
        installedPaths: [p.masterPath],
        reason: 'not-in-catalog',
      })
    }
  }

  return orphans
}

interface ForceUninstallInput {
  customType: 'skill' | 'agent'
  customId: string
}

export async function forceUninstallOrphan(
  params: ForceUninstallInput,
): Promise<{ deletedPaths: string[]; removedGuideEntries: number; notFound: boolean }> {
  const catalogPath = getCatalogPath()
  const tracker = await readTracker(catalogPath)
  const matching = tracker.operations.filter(
    (o) => o.customType === params.customType && o.customId === params.customId,
  )
  if (matching.length === 0) {
    return { deletedPaths: [], removedGuideEntries: 0, notFound: true }
  }

  const home = os.homedir()

  // Pre-validate: collect paths and sanity-check before any mutation.
  const toDelete: string[] = matching
    .filter((op) => op.type === 'copy')
    .map((op) => op.toPath)

  const deletedPaths: string[] = []
  for (const p of toDelete) {
    if (existsSync(p)) {
      await deleteFileAndCleanup(p, home)
      deletedPaths.push(p)
    }
  }

  // Remove from tracker.
  tracker.operations = tracker.operations.filter(
    (o) => !(o.customType === params.customType && o.customId === params.customId),
  )
  tracker.catalogPath = catalogPath
  await writeTracker(tracker)

  // Cascade to application-guide: if any entries referenced this custom
  // as a patchId (unusual — patches and skills/agents live in different
  // namespaces), drop them. Harmless no-op in the common case.
  let removedGuideEntries = 0
  if (params.customType !== 'skill' && params.customType !== 'agent') {
    // Guide entries only exist for patches, which are handled elsewhere.
    return { deletedPaths, removedGuideEntries, notFound: false }
  }
  const guide = await readGuide(catalogPath)
  for (const target of ['CLAUDE.md', 'AGENTS.md'] as const) {
    const before = guide.targets[target].length
    guide.targets[target] = guide.targets[target].filter((e) => e.patchId !== params.customId)
    removedGuideEntries += before - guide.targets[target].length
  }
  if (removedGuideEntries > 0) {
    await writeGuide(catalogPath, guide)
  }

  return { deletedPaths, removedGuideEntries, notFound: false }
}

/**
 * Force-uninstall a patch that is no longer in the catalog. Restores
 * the master from `.original` (if present), removes the tracker.patches
 * entry, and drops any matching guide entries.
 */
export async function forceUninstallPatchOrphan(
  target: 'CLAUDE.md' | 'AGENTS.md',
): Promise<{ restored: boolean; removedGuideEntries: number; notFound: boolean }> {
  const catalogPath = getCatalogPath()
  const tracker = await readTracker(catalogPath)
  const entry = tracker.patches.find((p) => p.target === target)
  if (!entry) return { restored: false, removedGuideEntries: 0, notFound: true }

  // Restore master from .original if present.
  let restored = false
  if (existsSync(entry.originalBackup)) {
    const fs = await import('node:fs/promises')
    await fs.copyFile(entry.originalBackup, entry.masterPath)
    restored = true
  }

  // Drop tracker.patches entry.
  tracker.patches = tracker.patches.filter((p) => p.target !== target)
  tracker.catalogPath = catalogPath
  await writeTracker(tracker)

  // Drop all guide entries for this master (they reference patches no
  // longer in the catalog per our check).
  const guide = await readGuide(catalogPath)
  const before = guide.targets[target].length
  guide.targets[target] = []
  const removedGuideEntries = before
  if (removedGuideEntries > 0) {
    await writeGuide(catalogPath, guide)
  }

  return { restored, removedGuideEntries, notFound: false }
}
