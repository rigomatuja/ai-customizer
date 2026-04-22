import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Tool, TrackerOp } from '../../shared/schemas'
import { ManifestSchema } from '../../shared/schemas'
import { getCatalogPath } from '../catalog/paths'
import { readTracker, writeTracker } from '../state/tracker'
import { copyFile, hashFile } from './fs-utils'

export interface ManagerStatus {
  present: boolean
  catalogVersion: string | null
  installed: Record<Tool, { installed: boolean; path: string; version: string | null }>
}

function managerSource(catalogPath: string, version: string, tool: Tool): string {
  return path.join(catalogPath, 'manager', `v${version}`, tool, 'manager.md')
}

function managerDest(tool: Tool): string {
  const home = os.homedir()
  return tool === 'claude'
    ? path.join(home, '.claude', 'agents', 'manager.md')
    : path.join(home, '.config', 'opencode', 'agent', 'manager.md')
}

async function readManagerManifest(catalogPath: string) {
  const manifestPath = path.join(catalogPath, 'manager', 'manifest.json')
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

export async function getManagerStatus(): Promise<ManagerStatus> {
  const catalogPath = getCatalogPath()
  const manifest = await readManagerManifest(catalogPath)
  const catalogVersion = manifest?.activeVersion ?? null

  const tracker = await readTracker(catalogPath)

  const statusFor = (tool: Tool) => {
    const dest = managerDest(tool)
    const trackerEntry = tracker.operations.find(
      (o) => o.customType === 'agent' && o.customId === 'manager' && o.tool === tool,
    )
    return {
      installed: existsSync(dest),
      path: dest,
      version: trackerEntry?.version ?? null,
    }
  }

  return {
    present: manifest !== null,
    catalogVersion,
    installed: {
      claude: statusFor('claude'),
      opencode: statusFor('opencode'),
    },
  }
}

export interface InstallManagerResult {
  installed: Array<{ tool: Tool; path: string; version: string }>
  skipped: Array<{ tool: Tool; reason: string }>
}

export async function installManager(tools: Tool[]): Promise<InstallManagerResult> {
  const catalogPath = getCatalogPath()
  const manifest = await readManagerManifest(catalogPath)
  if (!manifest) throw new Error('manager manifest not found in catalog')
  const version = manifest.activeVersion

  const installed: InstallManagerResult['installed'] = []
  const skipped: InstallManagerResult['skipped'] = []

  const now = new Date().toISOString()
  const tracker = await readTracker(catalogPath)

  // Drop any existing manager tracker entries to replace.
  tracker.operations = tracker.operations.filter(
    (o) => !(o.customType === 'agent' && o.customId === 'manager'),
  )

  for (const tool of tools) {
    const src = managerSource(catalogPath, version, tool)
    if (!existsSync(src)) {
      skipped.push({ tool, reason: `source file not found: ${src}` })
      continue
    }
    const dst = managerDest(tool)
    await copyFile(src, dst)

    const trackerOp: TrackerOp = {
      opId: randomUUID(),
      type: 'copy',
      customId: 'manager',
      customType: 'agent',
      version,
      tool,
      target: { scope: 'global' },
      toPath: dst,
      fromPath: src,
      contentHash: await hashFile(dst),
      installedAt: now,
    }
    tracker.operations.push(trackerOp)
    installed.push({ tool, path: dst, version })
  }

  tracker.catalogPath = catalogPath
  tracker.lastApply = now
  await writeTracker(tracker)

  return { installed, skipped }
}

export async function uninstallManager(): Promise<{ removed: Array<{ tool: Tool; path: string }> }> {
  const catalogPath = getCatalogPath()
  const tracker = await readTracker(catalogPath)
  const removed: Array<{ tool: Tool; path: string }> = []

  const entries = tracker.operations.filter(
    (o) => o.customType === 'agent' && o.customId === 'manager',
  )
  for (const e of entries) {
    if (existsSync(e.toPath)) {
      await fs.unlink(e.toPath).catch(() => undefined)
    }
    removed.push({ tool: e.tool, path: e.toPath })
  }

  tracker.operations = tracker.operations.filter(
    (o) => !(o.customType === 'agent' && o.customId === 'manager'),
  )
  tracker.catalogPath = catalogPath
  await writeTracker(tracker)
  return { removed }
}
