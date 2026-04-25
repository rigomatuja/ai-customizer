import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import {
  ProjectsFileSchema,
  type ProjectCreateInput,
  type ProjectEntry,
  type ProjectUpdateInput,
  type ProjectsFile,
} from '../../shared/schemas'
import { expandHome, writeJsonAtomic } from '../installer/fs-utils'
import { userConfigPaths } from './paths'
import { readTracker } from './tracker'
import { getCatalogPath } from '../catalog/paths'

async function readFile(): Promise<ProjectsFile> {
  const p = userConfigPaths()
  if (!existsSync(p.projects)) {
    return { schemaVersion: '1.0', projects: [] }
  }
  try {
    const raw = await fs.readFile(p.projects, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = ProjectsFileSchema.safeParse(parsed)
    if (!result.success) return { schemaVersion: '1.0', projects: [] }
    return result.data
  } catch {
    return { schemaVersion: '1.0', projects: [] }
  }
}

async function writeFile(data: ProjectsFile): Promise<void> {
  const p = userConfigPaths()
  await writeJsonAtomic(p.projects, data)
}

export async function listProjects(): Promise<ProjectEntry[]> {
  const file = await readFile()
  // Normalize stored paths so every consumer (planner, executor, hook
  // registry, orphans) gets an absolute path. `~` and `~/...` expand
  // to the user's home dir; absolute paths and other relative paths
  // pass through unchanged.
  return file.projects.map((p) => ({ ...p, path: expandHome(p.path) }))
}

export async function createProject(input: ProjectCreateInput): Promise<ProjectEntry> {
  const file = await readFile()
  const entry: ProjectEntry = { id: randomUUID(), ...input }
  file.projects.push(entry)
  await writeFile(file)
  return entry
}

export async function updateProject(
  id: string,
  input: ProjectUpdateInput,
): Promise<ProjectEntry | null> {
  const file = await readFile()
  const idx = file.projects.findIndex((p) => p.id === id)
  if (idx === -1) return null
  const existing = file.projects[idx]!
  const updated: ProjectEntry = {
    id: existing.id,
    name: input.name ?? existing.name,
    path: input.path ?? existing.path,
    repoUrl: input.repoUrl ?? existing.repoUrl,
  }
  file.projects[idx] = updated
  await writeFile(file)
  return updated
}

export interface ProjectDeleteBlocker {
  code: 'has-installations'
  message: string
  installedCustoms: Array<{ customType: string; customId: string; tool: string }>
}

export async function deleteProject(
  id: string,
  force: boolean = false,
): Promise<{ ok: boolean; notFound: boolean; blocker?: ProjectDeleteBlocker }> {
  const file = await readFile()
  const target = file.projects.find((p) => p.id === id)
  if (!target) return { ok: false, notFound: true }

  if (!force) {
    // Block deletion if any tracker op points at this project.
    try {
      const catalogPath = getCatalogPath()
      const tracker = await readTracker(catalogPath)
      const installedHere = tracker.operations.filter(
        (op) => op.target.scope === 'project' && op.target.projectId === id,
      )
      if (installedHere.length > 0) {
        return {
          ok: false,
          notFound: false,
          blocker: {
            code: 'has-installations',
            message: `Cannot delete project "${target.name}" — ${installedHere.length} custom(s) are still installed there. Uninstall them first, or pass { force: true } to delete the project anyway (leaves installed files on disk).`,
            installedCustoms: installedHere.map((op) => ({
              customType: op.customType,
              customId: op.customId,
              tool: op.tool,
            })),
          },
        }
      }
    } catch {
      // If tracker / catalog are unavailable, skip the guard rather
      // than block the delete.
    }
  }

  file.projects = file.projects.filter((p) => p.id !== id)
  await writeFile(file)
  return { ok: true, notFound: false }
}
