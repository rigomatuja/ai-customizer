import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { InstallableType, TargetScope, Tool } from '../../shared/schemas'
import type { ProjectEntry } from '../../shared/schemas'

export interface InstallAsset {
  sourceFile: string
  destFile: string
}

/**
 * Resolve source + destination paths for a given custom install.
 *
 * Returns a LIST of assets because a single (custom, tool, scope) tuple
 * may produce more than one file on disk:
 *   - skills: always 1 asset (SKILL.md).
 *   - agents (Opencode): always 1 asset (the agent body).
 *   - agents (Claude): 1 asset by default (the subagent body). A second
 *     asset — a slash-command file at `<claude>/commands/<id>.md` — is
 *     produced when the authoring folder contains an OPTIONAL
 *     `v<ver>/claude/slash-command.md`. Presence-based opt-in: no
 *     manifest schema change needed.
 *
 * Disk layout per case:
 *   - skill    → `<skills-dir>/<id>/SKILL.md`
 *   - agent    → `<agents-dir>/<id>.md` (plural for Claude, singular for Opencode)
 *   - slash    → `<claude>/commands/<id>.md`  (Claude only, opt-in)
 */
export function resolveInstallPath(params: {
  catalogPath: string
  customId: string
  customType: InstallableType
  version: string
  tool: Tool
  target: TargetScope
  projects: ProjectEntry[]
}): InstallAsset[] | { error: string } {
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
    // agent — Opencode docs (opencode.ai/docs/config) document plural
    // directory names as the supported convention; singular `agent/`
    // is backwards-compatible only. Use `agents/` for both tools.
    if (tool === 'claude') {
      const baseClaude = target.scope === 'global' ? path.join(home, '.claude') : path.join(projectRoot!, '.claude')
      destFile = path.join(baseClaude, 'agents', `${customId}.md`)
    } else {
      const baseOpencode =
        target.scope === 'global' ? path.join(home, '.config', 'opencode') : path.join(projectRoot!, '.opencode')
      destFile = path.join(baseOpencode, 'agents', `${customId}.md`)
    }
  }

  const assets: InstallAsset[] = [{ sourceFile, destFile }]

  // Optional companion: Claude agent slash-command file. Opt-in by
  // presence of `v<ver>/claude/slash-command.md` in the authoring.
  // Opencode has no slash-command mechanism — never attached there.
  if (customType === 'agent' && tool === 'claude') {
    const slashSource = path.join(
      catalogPath,
      'customizations',
      typeFolder,
      customId,
      `v${version}`,
      'claude',
      'slash-command.md',
    )
    if (existsSync(slashSource)) {
      const baseClaude =
        target.scope === 'global' ? path.join(home, '.claude') : path.join(projectRoot!, '.claude')
      assets.push({
        sourceFile: slashSource,
        destFile: path.join(baseClaude, 'commands', `${customId}.md`),
      })
    }
  }

  return assets
}

// Back-compat alias for modules that imported the old type name.
export type InstallPathResolution = InstallAsset
