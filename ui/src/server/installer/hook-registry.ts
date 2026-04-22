import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  InstallableType,
  Manifest,
  ProjectEntry,
  Tool,
  TrackerFile,
  TrackerOp,
} from '../../shared/schemas'
import { ManifestSchema } from '../../shared/schemas'
import { catalogPaths } from '../catalog/paths'
import { userConfigPaths } from '../state/paths'
import { writeJsonAtomic } from './fs-utils'

interface HookRegistryEntry {
  customId: string
  customType: InstallableType
  version: string
  tool: Tool
  scope: 'global' | 'project'
  projectPath?: string
  installedPath: string
  triggers: Array<{ type: string; target: string }>
  onFail?: 'halt' | 'warn' | 'continue'
}

interface HookRegistryFile {
  schemaVersion: '1.0'
  generatedAt: string
  hooks: HookRegistryEntry[]
}

function emptyRegistry(): HookRegistryFile {
  return { schemaVersion: '1.0', generatedAt: new Date().toISOString(), hooks: [] }
}

async function readManifest(
  catalogRoot: string,
  customType: InstallableType,
  customId: string,
): Promise<Manifest | null> {
  const p = catalogPaths(catalogRoot)
  const dir =
    customType === 'skill'
      ? p.customizations.skills
      : customType === 'agent'
        ? p.customizations.agents
        : p.customizations.patches
  const manifestPath = path.join(dir, customId, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    const raw = await fs.readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = ManifestSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

async function collectHooksFromTracker(
  catalogRoot: string,
  tracker: TrackerFile,
): Promise<HookRegistryEntry[]> {
  const seen = new Set<string>()
  const hooks: HookRegistryEntry[] = []

  for (const op of tracker.operations) {
    if (op.type !== 'copy') continue
    const key = `${op.customType}:${op.customId}:${op.tool}:${op.target.scope === 'project' ? op.target.projectId : 'global'}`
    if (seen.has(key)) continue
    seen.add(key)

    const manifest = await readManifest(catalogRoot, op.customType, op.customId)
    if (!manifest) continue
    if (manifest.type === 'patch') continue
    if (!manifest.hook) continue

    hooks.push({
      customId: op.customId,
      customType: op.customType,
      version: op.version,
      tool: op.tool,
      scope: op.target.scope,
      projectPath: undefined,
      installedPath: op.toPath,
      triggers: manifest.hook.triggers,
      onFail: manifest.hook.onFail,
    })
  }

  return hooks
}

function groupByScope(
  hooks: HookRegistryEntry[],
  projects: ProjectEntry[],
  trackerOps: TrackerOp[],
): { global: HookRegistryEntry[]; byProjectPath: Map<string, HookRegistryEntry[]> } {
  const global: HookRegistryEntry[] = []
  const byProjectPath = new Map<string, HookRegistryEntry[]>()

  for (const h of hooks) {
    if (h.scope === 'global') {
      global.push(h)
      continue
    }
    const op = trackerOps.find(
      (o) =>
        o.type === 'copy' &&
        o.customId === h.customId &&
        o.customType === h.customType &&
        o.tool === h.tool &&
        o.target.scope === 'project',
    )
    const projectId =
      op && op.target.scope === 'project'
        ? (op.target as { scope: 'project'; projectId: string }).projectId
        : null
    if (!projectId) continue
    const project = projects.find((p) => p.id === projectId)
    if (!project) continue

    const enriched: HookRegistryEntry = { ...h, projectPath: project.path }
    const list = byProjectPath.get(project.path) ?? []
    list.push(enriched)
    byProjectPath.set(project.path, list)
  }

  return { global, byProjectPath }
}

async function writeRegistry(filePath: string, content: HookRegistryFile): Promise<void> {
  await writeJsonAtomic(filePath, content)
}

export async function regenerateHookRegistries(params: {
  catalogRoot: string
  tracker: TrackerFile
  projects: ProjectEntry[]
}): Promise<{
  globalPath: string
  globalCount: number
  projectPaths: Array<{ path: string; count: number }>
}> {
  const { catalogRoot, tracker, projects } = params

  const allHooks = await collectHooksFromTracker(catalogRoot, tracker)
  const grouped = groupByScope(allHooks, projects, tracker.operations)

  const userPaths = userConfigPaths()
  const globalPath = path.join(userPaths.root, 'hook-registry.json')

  const globalFile: HookRegistryFile = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    hooks: grouped.global,
  }
  await writeRegistry(globalPath, globalFile)

  const projectPaths: Array<{ path: string; count: number }> = []
  for (const [projectPath, hooks] of grouped.byProjectPath) {
    const filePath = path.join(projectPath, '.atl', 'hook-registry.json')
    const file: HookRegistryFile = {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      hooks,
    }
    await writeRegistry(filePath, file)
    projectPaths.push({ path: filePath, count: hooks.length })
  }

  return {
    globalPath,
    globalCount: grouped.global.length,
    projectPaths,
  }
}

export async function readGlobalHookRegistry(): Promise<HookRegistryFile> {
  const userPaths = userConfigPaths()
  const globalPath = path.join(userPaths.root, 'hook-registry.json')
  if (!existsSync(globalPath)) return emptyRegistry()
  try {
    const raw = await fs.readFile(globalPath, 'utf8')
    return JSON.parse(raw) as HookRegistryFile
  } catch {
    return emptyRegistry()
  }
}

export type { HookRegistryEntry, HookRegistryFile }
