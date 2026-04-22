import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  ProjectsFileSchema,
  type ProjectCreateInput,
  type ProjectEntry,
  type ProjectUpdateInput,
  type ProjectsFile,
} from '../../shared/schemas'
import { userConfigPaths } from './paths'

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
  await fs.mkdir(path.dirname(p.projects), { recursive: true })
  await fs.writeFile(p.projects, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export async function listProjects(): Promise<ProjectEntry[]> {
  const file = await readFile()
  return file.projects
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

export async function deleteProject(id: string): Promise<boolean> {
  const file = await readFile()
  const before = file.projects.length
  file.projects = file.projects.filter((p) => p.id !== id)
  if (file.projects.length === before) return false
  await writeFile(file)
  return true
}
