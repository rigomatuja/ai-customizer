import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import type { Tool, TrackerOp } from '../../shared/schemas'
import type { LoadedCatalog } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'
import { readTracker, writeTracker } from '../state/tracker'
import { deleteFileAndCleanup } from './fs-utils'
import os from 'node:os'

export interface OrphanEntry {
  customId: string
  customType: 'skill' | 'agent'
  version: string
  tool: Tool
  installedPath: string
  reason: 'not-in-catalog'
}

export function computeOrphans(tracker: ReturnType<typeof readTracker> extends Promise<infer T> ? T : never, catalog: LoadedCatalog): OrphanEntry[] {
  const presentKeys = new Set(catalog.customs.map((c) => `${c.type}:${c.id}`))
  // The manager is a special citizen — never flag as orphan even
  // though it's not under customizations/.
  const orphans: OrphanEntry[] = []
  for (const op of tracker.operations) {
    if (op.type !== 'copy') continue
    if (op.customType === 'agent' && op.customId === 'manager') continue
    const key = `${op.customType}:${op.customId}`
    if (!presentKeys.has(key)) {
      orphans.push({
        customId: op.customId,
        customType: op.customType,
        version: op.version,
        tool: op.tool,
        installedPath: op.toPath,
        reason: 'not-in-catalog',
      })
    }
  }
  return orphans
}

export async function forceUninstallOrphan(params: {
  customType: 'skill' | 'agent'
  customId: string
}): Promise<{ deletedPaths: string[]; notFound: boolean }> {
  const catalogPath = getCatalogPath()
  const tracker = await readTracker(catalogPath)
  const matching = tracker.operations.filter(
    (o) => o.customType === params.customType && o.customId === params.customId,
  )
  if (matching.length === 0) return { deletedPaths: [], notFound: true }

  const home = os.homedir()
  const deletedPaths: string[] = []

  for (const op of matching) {
    if (op.type === 'copy' && existsSync(op.toPath)) {
      await deleteFileAndCleanup(op.toPath, home)
      deletedPaths.push(op.toPath)
    }
  }

  tracker.operations = tracker.operations.filter(
    (o) => !(o.customType === params.customType && o.customId === params.customId),
  )
  tracker.catalogPath = catalogPath
  await writeTracker(tracker)

  return { deletedPaths, notFound: false }
}

// re-export for type plumbing
export type { TrackerOp }

// helper: silence fs unused
void fs
