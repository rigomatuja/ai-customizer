import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  InstallationsFileSchema,
  type InstallationEntry,
  type InstallationsFile,
  type InstallableType,
  type TargetScope,
} from '../../shared/schemas'
import { userConfigPaths } from './paths'

const EMPTY: InstallationsFile = { schemaVersion: '1.0', installations: [] }

async function readFile(): Promise<InstallationsFile> {
  const p = userConfigPaths()
  if (!existsSync(p.installations)) return EMPTY
  try {
    const raw = await fs.readFile(p.installations, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = InstallationsFileSchema.safeParse(parsed)
    return result.success ? result.data : EMPTY
  } catch {
    return EMPTY
  }
}

async function writeFile(data: InstallationsFile): Promise<void> {
  const p = userConfigPaths()
  await fs.mkdir(path.dirname(p.installations), { recursive: true })
  await fs.writeFile(p.installations, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export async function listInstallations(): Promise<InstallationEntry[]> {
  return (await readFile()).installations
}

function sameKey(a: { customId: string; customType: InstallableType }, b: { customId: string; customType: InstallableType }): boolean {
  return a.customId === b.customId && a.customType === b.customType
}

export async function upsertInstallation(entry: InstallationEntry): Promise<InstallationEntry> {
  const file = await readFile()
  const idx = file.installations.findIndex((e) => sameKey(e, entry))
  if (idx === -1) file.installations.push(entry)
  else file.installations[idx] = entry
  await writeFile(file)
  return entry
}

export async function removeInstallation(
  customType: InstallableType,
  customId: string,
): Promise<boolean> {
  const file = await readFile()
  const before = file.installations.length
  file.installations = file.installations.filter(
    (e) => !(e.customType === customType && e.customId === customId),
  )
  if (file.installations.length === before) return false
  await writeFile(file)
  return true
}

export type { InstallationEntry, TargetScope }
