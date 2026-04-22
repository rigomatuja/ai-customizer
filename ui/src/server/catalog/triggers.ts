import fs from 'node:fs/promises'
import { TriggersFileSchema, type TriggersFile } from '../../shared/schemas'
import { writeJsonAtomic } from '../installer/fs-utils'
import { catalogPaths } from './paths'

const EMPTY: TriggersFile = { schemaVersion: '1.0', triggers: [] }

export async function readTriggers(catalogRoot: string): Promise<TriggersFile> {
  const p = catalogPaths(catalogRoot)
  try {
    const raw = await fs.readFile(p.triggers, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = TriggersFileSchema.safeParse(parsed)
    return result.success ? result.data : EMPTY
  } catch {
    return EMPTY
  }
}

export async function writeTriggers(catalogRoot: string, file: TriggersFile): Promise<void> {
  const p = catalogPaths(catalogRoot)
  await writeJsonAtomic(p.triggers, file)
}

export async function addTrigger(catalogRoot: string, trigger: string): Promise<TriggersFile> {
  const file = await readTriggers(catalogRoot)
  if (!file.triggers.includes(trigger)) {
    file.triggers.push(trigger)
    await writeTriggers(catalogRoot, file)
  }
  return file
}

export async function removeTrigger(
  catalogRoot: string,
  trigger: string,
): Promise<TriggersFile | null> {
  const file = await readTriggers(catalogRoot)
  const before = file.triggers.length
  file.triggers = file.triggers.filter((t) => t !== trigger)
  if (file.triggers.length === before) return null
  await writeTriggers(catalogRoot, file)
  return file
}

export function isKnownTrigger(file: TriggersFile, target: string): boolean {
  // Exact match OR wildcard match for 'agent-event:*:foo' style triggers.
  if (file.triggers.includes(target)) return true
  for (const t of file.triggers) {
    if (!t.includes('*')) continue
    const regex = new RegExp('^' + t.replace(/\*/g, '[^:]+') + '$')
    if (regex.test(target)) return true
  }
  return false
}
