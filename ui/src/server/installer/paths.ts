import os from 'node:os'
import path from 'node:path'
import type { InstallableType, TargetScope, Tool } from '../../shared/schemas'
import type { ProjectEntry } from '../../shared/schemas'

export interface InstallPathResolution {
  sourceFile: string
  destFile: string
}

/**
 * Resolve source + destination paths for a given custom install.
 * - skills: `<tool>/SKILL.md` → `<skills-dir>/<id>/SKILL.md`
 * - agents: `<tool>/<id>.md`  → `<agents-dir>/<id>.md`
 */
export function resolveInstallPath(params: {
  catalogPath: string
  customId: string
  customType: InstallableType
  version: string
  tool: Tool
  target: TargetScope
  projects: ProjectEntry[]
}): InstallPathResolution | { error: string } {
  const { catalogPath, customId, customType, version, tool, target, projects } = params

  const projectRoot =
    target.scope === 'project'
      ? projects.find((p) => p.id === target.projectId)?.path
      : undefined

  if (target.scope === 'project' && !projectRoot) {
    return { error: `unknown project id: ${target.projectId}` }
  }

  const home = os.homedir()

  const typeFolder = customType === 'skill' ? 'skills' : 'agents'
  const fileName = customType === 'skill' ? 'SKILL.md' : `${customId}.md`

  const sourceFile = path.join(
    catalogPath,
    'customizations',
    typeFolder,
    customId,
    `v${version}`,
    tool,
    fileName,
  )

  let destFile: string

  if (customType === 'skill') {
    if (tool === 'claude') {
      const baseClaude = target.scope === 'global' ? path.join(home, '.claude') : path.join(projectRoot!, '.claude')
      destFile = path.join(baseClaude, 'skills', customId, 'SKILL.md')
    } else {
      const baseOpencode =
        target.scope === 'global' ? path.join(home, '.config', 'opencode') : path.join(projectRoot!, '.opencode')
      destFile = path.join(baseOpencode, 'skills', customId, 'SKILL.md')
    }
  } else {
    // agent
    if (tool === 'claude') {
      const baseClaude = target.scope === 'global' ? path.join(home, '.claude') : path.join(projectRoot!, '.claude')
      destFile = path.join(baseClaude, 'agents', `${customId}.md`)
    } else {
      const baseOpencode =
        target.scope === 'global' ? path.join(home, '.config', 'opencode') : path.join(projectRoot!, '.opencode')
      destFile = path.join(baseOpencode, 'agent', `${customId}.md`)
    }
  }

  return { sourceFile, destFile }
}
