import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { HistoryFileSchema, type HistoryEntry, type HistoryFile } from '../../shared/schemas'
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
  await fs.mkdir(path.dirname(p.history), { recursive: true })
  await fs.writeFile(p.history, JSON.stringify(data, null, 2) + '\n', 'utf8')
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
