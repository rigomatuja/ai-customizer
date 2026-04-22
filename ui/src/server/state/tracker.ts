import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import {
  TrackerFileSchema,
  type TrackerFile,
  type TrackerOp,
} from '../../shared/schemas'
import { writeJsonAtomic } from '../installer/fs-utils'
import { userConfigPaths } from './paths'

function emptyTracker(catalogPath: string): TrackerFile {
  return {
    schemaVersion: '1.0',
    catalogPath,
    lastApply: null,
    lastApplyResult: null,
    operations: [],
    patches: [],
  }
}

export async function readTracker(catalogPath: string): Promise<TrackerFile> {
  const p = userConfigPaths()
  if (!existsSync(p.installState)) return emptyTracker(catalogPath)
  try {
    const raw = await fs.readFile(p.installState, 'utf8')
    const parsed = JSON.parse(raw) as { patches?: unknown } & Record<string, unknown>
    if (!Array.isArray(parsed.patches)) parsed.patches = []
    const result = TrackerFileSchema.safeParse(parsed)
    return result.success ? result.data : emptyTracker(catalogPath)
  } catch {
    return emptyTracker(catalogPath)
  }
}

export async function writeTracker(data: TrackerFile): Promise<void> {
  const p = userConfigPaths()
  await writeJsonAtomic(p.installState, data)
}

export function trackerOpsFor(
  tracker: TrackerFile,
  customType: TrackerOp['customType'],
  customId: string,
): TrackerOp[] {
  return tracker.operations.filter((o) => o.customType === customType && o.customId === customId)
}
