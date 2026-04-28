import { existsSync } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expandHome } from '../installer/fs-utils'
import { userConfigPaths } from '../state/paths'

const CATALOG_CONFIG_FILE = path.join('.ai-customizer', 'catalog.json')
let runtimeCatalogPath: string | null = null

export type CatalogPathSource = 'env' | 'config' | 'discovered'

/**
 * Resolves the catalog root directory by walking up from `startDir`
 * looking for a `.ai-customizer/catalog.json` marker.
 * Throws if not found.
 */
export function findCatalogRoot(startDir: string): string {
  let dir = path.resolve(startDir)
  while (true) {
    if (existsSync(path.join(dir, CATALOG_CONFIG_FILE))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        `Could not locate catalog root: no ${CATALOG_CONFIG_FILE} found walking up from ${startDir}`,
      )
    }
    dir = parent
  }
}

/**
 * Resolves the catalog path in the following order:
 * 1. `CATALOG_PATH` env var (absolute or relative to cwd)
 * 2. Walk up from this server's source file location
 */
export function getCatalogPath(): string {
  const override = process.env.CATALOG_PATH
  if (override && override.length > 0) return path.resolve(expandHome(override))

  if (!runtimeCatalogPath) {
    const fromConfig = readCatalogPathFromUserConfig()
    if (fromConfig) runtimeCatalogPath = fromConfig
  }

  if (runtimeCatalogPath) return runtimeCatalogPath

  const serverDir = path.dirname(fileURLToPath(import.meta.url))
  return findCatalogRoot(serverDir)
}

function readCatalogPathFromUserConfig(): string | null {
  const p = userConfigPaths().config
  if (!existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as { catalogPath?: unknown }
    if (typeof parsed.catalogPath !== 'string' || parsed.catalogPath.trim().length === 0) return null
    return path.resolve(expandHome(parsed.catalogPath))
  } catch {
    return null
  }
}

export function getCatalogPathSource(): CatalogPathSource {
  const override = process.env.CATALOG_PATH
  if (override && override.length > 0) return 'env'
  if (runtimeCatalogPath) return 'config'
  return 'discovered'
}

export function setRuntimeCatalogPath(nextPath: string): void {
  runtimeCatalogPath = path.resolve(expandHome(nextPath))
}

export function catalogPaths(catalogRoot: string) {
  return {
    root: catalogRoot,
    config: path.join(catalogRoot, '.ai-customizer', 'catalog.json'),
    triggers: path.join(catalogRoot, '.ai-customizer', 'triggers.json'),
    guide: path.join(catalogRoot, 'application-guide.json'),
    customizations: {
      skills: path.join(catalogRoot, 'customizations', 'skills'),
      agents: path.join(catalogRoot, 'customizations', 'agents'),
      patches: path.join(catalogRoot, 'customizations', 'patches'),
    },
  }
}
