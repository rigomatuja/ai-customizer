import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import {
  UserConfigSchema,
  type ToolsOverride,
  type UserConfig,
} from '../../shared/schemas'
import { ensureDir, writeJsonAtomic } from '../installer/fs-utils'
import { userConfigPaths } from './paths'

export async function readUserConfig(): Promise<UserConfig | null> {
  const p = userConfigPaths()
  if (!existsSync(p.config)) return null
  try {
    const raw = await fs.readFile(p.config, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = UserConfigSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export async function writeUserConfig(cfg: UserConfig): Promise<void> {
  const p = userConfigPaths()
  await writeJsonAtomic(p.config, cfg)
}

export interface InitConfigInput {
  catalogPath: string
}

export async function initUserConfig(input: InitConfigInput): Promise<UserConfig> {
  const existing = await readUserConfig()
  if (existing) return existing

  const now = new Date().toISOString()
  const cfg: UserConfig = {
    schemaVersion: '1.0',
    catalogPath: input.catalogPath,
    createdAt: now,
    updatedAt: now,
  }
  await writeUserConfig(cfg)
  return cfg
}

export async function updateToolsOverride(
  override: ToolsOverride | null,
): Promise<UserConfig | null> {
  const current = await readUserConfig()
  if (!current) return null
  const updated: UserConfig = {
    ...current,
    toolsOverride: override ?? undefined,
    updatedAt: new Date().toISOString(),
  }
  await writeUserConfig(updated)
  return updated
}

export async function ensureUserConfigDir(): Promise<void> {
  const p = userConfigPaths()
  await ensureDir(p.root)
  await ensureDir(p.backups)
}
