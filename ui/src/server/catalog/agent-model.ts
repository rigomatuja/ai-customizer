import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ManifestSchema, type Tool } from '../../shared/schemas'
import { writeJsonAtomic } from '../installer/fs-utils'

// ---------------------------------------------------------------------------
// Agent model change — server-side helper for the UI's "change model" flow.
// ---------------------------------------------------------------------------
//
// Writes happen in the catalog (customizations/agents/<id>/**). This is the
// ONLY UI-driven write into customs/ content — explicitly documented as the
// single exception to "the UI does not edit catalog content".
//
// Semantics: each model change produces a PATCH VERSION BUMP. The current
// activeVersion folder is cloned to v<current+patch>/, the frontmatter of
// each targeted per-tool body file gets its `model:` field rewritten
// (inserted, replaced, or removed), and manifest.json grows a new
// versions[] entry + its activeVersion is bumped.
//
// Patch bump preserves the invariant that version folders are never mutated
// in place, without requiring the user to coordinate with the manager for a
// trivial model swap.

export class AgentModelChangeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AgentModelChangeError'
  }
}

export interface AgentModelChangeInput {
  catalogPath: string
  customId: string
  // undefined = do not touch that tool; null = remove model field; string = set value.
  claude?: string | null
  opencode?: string | null
  changelogNote?: string
}

export interface AgentModelChangeResult {
  fromVersion: string
  toVersion: string
  activeVersion: string
  touchedFiles: string[]
}

function bumpPatch(version: string): string {
  const parts = version.split('.')
  if (parts.length !== 3) throw new AgentModelChangeError('invalid-version', `cannot bump non-semver: ${version}`)
  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2])
  if ([major, minor, patch].some((n) => !Number.isFinite(n) || n < 0)) {
    throw new AgentModelChangeError('invalid-version', `cannot bump non-numeric semver: ${version}`)
  }
  return `${major}.${minor}.${patch + 1}`
}

function agentDir(catalogPath: string, customId: string): string {
  return path.join(catalogPath, 'customizations', 'agents', customId)
}

async function readManifest(catalogPath: string, customId: string) {
  const manifestPath = path.join(agentDir(catalogPath, customId), 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new AgentModelChangeError('not-found', `agent manifest not found: ${manifestPath}`)
  }
  const raw = await fs.readFile(manifestPath, 'utf8')
  const parsed = ManifestSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new AgentModelChangeError(
      'manifest-invalid',
      `manifest for agent:${customId} failed schema validation: ${parsed.error.message}`,
    )
  }
  if (parsed.data.type !== 'agent') {
    throw new AgentModelChangeError(
      'wrong-type',
      `change-model only applies to agents — got type "${parsed.data.type}"`,
    )
  }
  return { manifest: parsed.data, manifestPath }
}

async function copyDirRecursive(src: string, dst: string): Promise<void> {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const from = path.join(src, e.name)
    const to = path.join(dst, e.name)
    if (e.isDirectory()) {
      await copyDirRecursive(from, to)
    } else if (e.isFile()) {
      await fs.copyFile(from, to)
    }
  }
}

// Minimal YAML-frontmatter surgical updater.
// Only touches the first `---` block at the top of the file. Returns the
// updated content. If the value is null, the `model:` line is removed
// entirely; otherwise inserted or replaced.
function applyModelField(body: string, value: string | null): string {
  const lines = body.split('\n')
  if (lines[0] !== '---') {
    throw new AgentModelChangeError(
      'missing-frontmatter',
      'agent body must open with a `---` YAML frontmatter block',
    )
  }
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      closeIdx = i
      break
    }
  }
  if (closeIdx < 0) {
    throw new AgentModelChangeError(
      'missing-frontmatter-close',
      'agent body frontmatter is not closed by a `---` line',
    )
  }

  const head = lines.slice(0, closeIdx) // `---` + key/value lines
  const tail = lines.slice(closeIdx) // `---` close + rest of body

  // Find existing `model:` line (allow leading whitespace none; keys are
  // expected to start at column 0 in a flat frontmatter).
  const modelIdx = head.findIndex((l) => /^model\s*:/.test(l))

  if (value === null) {
    if (modelIdx >= 0) head.splice(modelIdx, 1)
    return [...head, ...tail].join('\n')
  }

  const newLine = `model: ${value}`
  if (modelIdx >= 0) {
    head[modelIdx] = newLine
  } else {
    head.push(newLine) // append at end of frontmatter, just before the closing `---`
  }
  return [...head, ...tail].join('\n')
}

async function updateToolBody(
  versionDir: string,
  tool: Tool,
  customId: string,
  value: string | null,
  touched: string[],
): Promise<void> {
  const bodyPath = path.join(versionDir, tool, `${customId}.md`)
  if (!existsSync(bodyPath)) {
    throw new AgentModelChangeError(
      'tool-variant-missing',
      `agent ${customId} has no ${tool} variant in this version — author the ${tool} body first`,
    )
  }
  const body = await fs.readFile(bodyPath, 'utf8')
  const updated = applyModelField(body, value)
  if (updated !== body) {
    await fs.writeFile(bodyPath, updated, 'utf8')
    touched.push(bodyPath)
  }
}

export async function changeAgentModel(input: AgentModelChangeInput): Promise<AgentModelChangeResult> {
  const { catalogPath, customId } = input

  if (input.claude === undefined && input.opencode === undefined) {
    throw new AgentModelChangeError('no-op', 'no tool target provided (at least one of claude/opencode required)')
  }

  const { manifest, manifestPath } = await readManifest(catalogPath, customId)
  const fromVersion = manifest.activeVersion
  const fromDir = path.join(agentDir(catalogPath, customId), `v${fromVersion}`)
  if (!existsSync(fromDir)) {
    throw new AgentModelChangeError(
      'version-missing',
      `active version folder missing on disk: ${fromDir}`,
    )
  }

  // Find the next available patch bump (handle the rare case where the
  // v<patch+1> folder already exists because of a prior incomplete run).
  let toVersion = bumpPatch(fromVersion)
  let toDir = path.join(agentDir(catalogPath, customId), `v${toVersion}`)
  while (existsSync(toDir)) {
    toVersion = bumpPatch(toVersion)
    toDir = path.join(agentDir(catalogPath, customId), `v${toVersion}`)
  }

  await copyDirRecursive(fromDir, toDir)

  const touchedFiles: string[] = []
  try {
    if (input.claude !== undefined) {
      await updateToolBody(toDir, 'claude', customId, input.claude, touchedFiles)
    }
    if (input.opencode !== undefined) {
      await updateToolBody(toDir, 'opencode', customId, input.opencode, touchedFiles)
    }
  } catch (err) {
    // Roll back: remove the half-written new version folder so we don't
    // leave orphan state on disk. Manifest has NOT been touched yet.
    await fs.rm(toDir, { recursive: true, force: true }).catch(() => undefined)
    throw err
  }

  if (touchedFiles.length === 0) {
    // No actual content change — don't bump the version for a no-op.
    await fs.rm(toDir, { recursive: true, force: true }).catch(() => undefined)
    throw new AgentModelChangeError(
      'no-effective-change',
      'requested model change produced no diff (already matched current frontmatter)',
    )
  }

  // Manifest update: append version + bump activeVersion.
  const changelogBits: string[] = []
  if (input.claude !== undefined) {
    changelogBits.push(
      input.claude === null ? 'Claude model unset' : `Claude model → ${input.claude}`,
    )
  }
  if (input.opencode !== undefined) {
    changelogBits.push(
      input.opencode === null ? 'Opencode model unset' : `Opencode model → ${input.opencode}`,
    )
  }
  const defaultNote = changelogBits.join('; ')
  const changelog = input.changelogNote?.trim() || defaultNote || 'Model assignment updated.'

  const nextManifest = {
    ...manifest,
    versions: [
      ...manifest.versions,
      {
        version: toVersion,
        createdAt: new Date().toISOString(),
        changelog,
      },
    ],
    activeVersion: toVersion,
  }

  await writeJsonAtomic(manifestPath, nextManifest)

  return {
    fromVersion,
    toVersion,
    activeVersion: toVersion,
    touchedFiles,
  }
}
