import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { HistoryFileSchema, type HistoryEntry, type HistoryFile } from '../../shared/schemas'
import { writeJsonAtomic } from '../installer/fs-utils'
import { userConfigPaths } from './paths'

const EMPTY: HistoryFile = { schemaVersion: '1.0', entries: [] }

async function readFile(): Promise<HistoryFile> {
  const p = userConfigPaths()
  if (!existsSync(p.history)) return EMPTY
  try {
    const raw = await fs.readFile(p.history, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = HistoryFileSchema.safeParse(parsed)
    return result.success ? result.data : EMPTY
  } catch {
    return EMPTY
  }
}

async function writeFile(data: HistoryFile): Promise<void> {
  const p = userConfigPaths()
  await writeJsonAtomic(p.history, data)
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const file = await readFile()
  return [...file.entries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const file = await readFile()
  file.entries.push(entry)
  await writeFile(file)
}
