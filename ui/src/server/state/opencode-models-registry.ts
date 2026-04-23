import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import {
  OpencodeModelRegistrySchema,
  type OpencodeModelEntry,
  type OpencodeModelRegistry,
} from '../../shared/schemas'
import { writeJsonAtomic } from '../installer/fs-utils'
import { userConfigPaths } from './paths'

// Opencode model registry lives in the state dir (per-machine) because
// the available models depend on the user's Opencode install and auth.
// Refreshed on demand from the UI; read by the manager via the API.

const EMPTY: OpencodeModelRegistry = {
  schemaVersion: '1.0',
  detectedAt: null,
  models: [],
}

export async function readOpencodeModelsRegistry(): Promise<OpencodeModelRegistry> {
  const p = userConfigPaths()
  if (!existsSync(p.opencodeModels)) return EMPTY
  try {
    const raw = await fs.readFile(p.opencodeModels, 'utf8')
    const parsed = OpencodeModelRegistrySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : EMPTY
  } catch {
    return EMPTY
  }
}

export async function writeOpencodeModelsRegistry(
  models: OpencodeModelEntry[],
): Promise<OpencodeModelRegistry> {
  const p = userConfigPaths()
  const registry: OpencodeModelRegistry = {
    schemaVersion: '1.0',
    detectedAt: new Date().toISOString(),
    models,
  }
  await writeJsonAtomic(p.opencodeModels, registry)
  return registry
}
