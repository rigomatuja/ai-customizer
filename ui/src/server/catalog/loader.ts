import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  ApplicationGuideSchema,
  CatalogConfigSchema,
  ManifestSchema,
  TriggersFileSchema,
  type ApplicationGuide,
  type CatalogConfig,
  type CustomType,
  type Manifest,
  type Tool,
} from '../../shared/schemas'
import type {
  CustomDetail,
  CustomSummary,
  ValidationIssue,
  VersionInfo,
} from '../../shared/types'
import { catalogPaths } from './paths'

export interface LoadedCatalog {
  config: CatalogConfig
  triggers: string[]
  guide: ApplicationGuide
  customs: CustomSummary[]
  issues: ValidationIssue[]
}

async function readJson<T>(
  filePath: string,
  schema: z.ZodType<T>,
): Promise<{ data: T | null; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = []
  if (!existsSync(filePath)) {
    issues.push({
      level: 'error',
      code: 'file-missing',
      message: `file not found`,
      path: filePath,
    })
    return { data: null, issues }
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = schema.safeParse(parsed)
    if (!result.success) {
      issues.push({
        level: 'error',
        code: 'schema-invalid',
        message: `schema validation failed: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        path: filePath,
      })
      return { data: null, issues }
    }
    return { data: result.data, issues }
  } catch (err) {
    issues.push({
      level: 'error',
      code: 'read-failed',
      message: err instanceof Error ? err.message : String(err),
      path: filePath,
    })
    return { data: null, issues }
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
}

function inferTools(versionDir: string): Tool[] {
  const tools: Tool[] = []
  if (existsSync(path.join(versionDir, 'claude'))) tools.push('claude')
  if (existsSync(path.join(versionDir, 'opencode'))) tools.push('opencode')
  return tools
}

async function loadCustom(
  customDir: string,
  expectedType: CustomType,
): Promise<{ summary: CustomSummary; detail: CustomDetail }> {
  const id = path.basename(customDir)
  const manifestPath = path.join(customDir, 'manifest.json')
  const issues: ValidationIssue[] = []

  const { data: manifest, issues: manifestIssues } = await readJson(manifestPath, ManifestSchema)
  issues.push(...manifestIssues)

  let tools: Tool[] = []
  let versionCount = 0
  const versions: VersionInfo[] = []

  if (manifest) {
    if (manifest.type !== expectedType) {
      issues.push({
        level: 'error',
        code: 'type-mismatch',
        message: `manifest type "${manifest.type}" does not match expected "${expectedType}"`,
        path: manifestPath,
      })
    }

    const availableVersionDirs = await safeReaddir(customDir)
    const versionDirs = availableVersionDirs.filter((n) => /^v\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(n))
    versionCount = versionDirs.length

    const activeDir = path.join(customDir, `v${manifest.activeVersion}`)
    if (!existsSync(activeDir)) {
      issues.push({
        level: 'error',
        code: 'active-version-missing',
        message: `activeVersion v${manifest.activeVersion} folder does not exist`,
        path: activeDir,
      })
    } else {
      tools = inferTools(activeDir)
      if (tools.length === 0) {
        issues.push({
          level: 'error',
          code: 'no-tools',
          message: `activeVersion folder has no claude/ or opencode/ subfolder`,
          path: activeDir,
        })
      }
    }

    for (const vEntry of manifest.versions) {
      const vDir = path.join(customDir, `v${vEntry.version}`)
      const files: VersionInfo['files'] = []
      if (existsSync(vDir)) {
        for (const tool of ['claude', 'opencode'] as const) {
          const tdir = path.join(vDir, tool)
          if (!existsSync(tdir)) continue
          const fileNames = await fs.readdir(tdir)
          for (const fname of fileNames) {
            files.push({ tool, relativePath: path.join(`v${vEntry.version}`, tool, fname) })
          }
        }
      }
      versions.push({
        version: vEntry.version,
        createdAt: vEntry.createdAt,
        changelog: vEntry.changelog,
        files,
      })
    }

    for (const vEntry of manifest.versions) {
      const vDir = path.join(customDir, `v${vEntry.version}`)
      if (!existsSync(vDir)) {
        issues.push({
          level: 'warning',
          code: 'version-folder-missing',
          message: `manifest lists v${vEntry.version} but folder is missing`,
          path: vDir,
        })
      }
    }
  }

  const valid = !issues.some((i) => i.level === 'error')

  const summary: CustomSummary = {
    id,
    name: manifest?.name ?? id,
    description: manifest?.description ?? '',
    type: manifest?.type ?? expectedType,
    category: manifest?.category ?? '',
    scope: manifest?.scope ?? 'global',
    project: manifest?.project ?? null,
    tools,
    activeVersion: manifest?.activeVersion ?? '',
    versionCount,
    hasHook: manifest?.type !== 'patch' && !!manifest?.hook,
    isPatch: manifest?.type === 'patch',
    patchTarget: manifest?.type === 'patch' ? manifest.target : undefined,
    valid,
    issues,
  }

  const detail: CustomDetail = {
    id,
    type: manifest?.type ?? expectedType,
    manifest: manifest ?? null,
    versions,
    valid,
    issues,
  }

  return { summary, detail }
}

async function loadCustomsOfType(
  dir: string,
  type: CustomType,
): Promise<Array<{ summary: CustomSummary; detail: CustomDetail }>> {
  const ids = await safeReaddir(dir)
  return Promise.all(ids.map((id) => loadCustom(path.join(dir, id), type)))
}

export async function loadCatalog(catalogRoot: string): Promise<LoadedCatalog> {
  const p = catalogPaths(catalogRoot)
  const issues: ValidationIssue[] = []

  const { data: config, issues: configIssues } = await readJson(p.config, CatalogConfigSchema)
  issues.push(...configIssues)
  const { data: triggersFile, issues: triggersIssues } = await readJson(p.triggers, TriggersFileSchema)
  issues.push(...triggersIssues)
  const { data: guide, issues: guideIssues } = await readJson(p.guide, ApplicationGuideSchema)
  issues.push(...guideIssues)

  const [skills, agents, patches] = await Promise.all([
    loadCustomsOfType(p.customizations.skills, 'skill'),
    loadCustomsOfType(p.customizations.agents, 'agent'),
    loadCustomsOfType(p.customizations.patches, 'patch'),
  ])

  const summaries = [...skills, ...agents, ...patches].map((r) => r.summary)

  return {
    config: config ?? { schemaVersion: '?', name: '(unavailable)', createdAt: '' },
    triggers: triggersFile?.triggers ?? [],
    guide:
      guide ?? ({ schemaVersion: '?', targets: { 'CLAUDE.md': [], 'AGENTS.md': [] } } as ApplicationGuide),
    customs: summaries,
    issues,
  }
}

export async function loadCustomDetail(
  catalogRoot: string,
  type: CustomType,
  id: string,
): Promise<CustomDetail | null> {
  const p = catalogPaths(catalogRoot)
  const customsDir =
    type === 'skill' ? p.customizations.skills : type === 'agent' ? p.customizations.agents : p.customizations.patches
  const customDir = path.join(customsDir, id)
  if (!existsSync(customDir)) return null
  const { detail } = await loadCustom(customDir, type)
  return detail
}

/**
 * Load all manifests in the catalog keyed by "{type}:{id}".
 * Returns only manifests that parse successfully.
 */
export async function loadAllManifests(catalogRoot: string): Promise<Map<string, Manifest>> {
  const p = catalogPaths(catalogRoot)
  const map = new Map<string, Manifest>()
  const dirs: Array<{ dir: string; type: CustomType }> = [
    { dir: p.customizations.skills, type: 'skill' },
    { dir: p.customizations.agents, type: 'agent' },
    { dir: p.customizations.patches, type: 'patch' },
  ]
  for (const { dir, type } of dirs) {
    const ids = await safeReaddir(dir)
    for (const id of ids) {
      const manifestPath = path.join(dir, id, 'manifest.json')
      if (!existsSync(manifestPath)) continue
      try {
        const raw = await fs.readFile(manifestPath, 'utf8')
        const parsed = JSON.parse(raw) as unknown
        const result = ManifestSchema.safeParse(parsed)
        if (result.success) map.set(`${type}:${id}`, result.data)
      } catch {
        // skip
      }
    }
  }
  return map
}

// Type guard to silence unused manifest import at module top when not needed
export type _ManifestType = Manifest
