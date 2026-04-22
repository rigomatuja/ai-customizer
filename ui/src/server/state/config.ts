import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  UserConfigSchema,
  type ToolsOverride,
  type UserConfig,
} from '../../shared/schemas'
import { userConfigPaths } from './paths'

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

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
  await writeJson(p.config, cfg)
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
