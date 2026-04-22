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

  // Capture any existing manager install on disk BEFORE we touch
  // anything — used for rollback if a later copy fails.
  const previousSnapshot = new Map<string, string>() // dst path → original content
  for (const tool of tools) {
    const dst = managerDest(tool)
    if (existsSync(dst)) {
      const fs = await import('node:fs/promises')
      previousSnapshot.set(dst, await fs.readFile(dst, 'utf8'))
    }
  }

  const stagedOps: TrackerOp[] = []
  const copiedPaths: string[] = []

  try {
    for (const tool of tools) {
      const src = managerSource(catalogPath, version, tool)
      if (!existsSync(src)) {
        skipped.push({ tool, reason: `source file not found: ${src}` })
        continue
      }
      const dst = managerDest(tool)
      await copyFile(src, dst)
      copiedPaths.push(dst)

      stagedOps.push({
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
      })
      installed.push({ tool, path: dst, version })
    }
  } catch (err) {
    // Rollback: restore any previous content, delete files that didn't
    // exist before, and rethrow. Tracker is untouched.
    const fsp = await import('node:fs/promises')
    for (const p of copiedPaths) {
      const prev = previousSnapshot.get(p)
      try {
        if (prev !== undefined) {
          await fsp.writeFile(p, prev, 'utf8')
        } else if (existsSync(p)) {
          await fsp.unlink(p)
        }
      } catch (rollbackErr) {
        console.error(
          `[ai-customizer] manager install rollback failed at ${p}: ${rollbackErr instanceof Error ? rollbackErr.message : rollbackErr}`,
        )
      }
    }
    console.error(
      `[ai-customizer] manager install failed (rollback attempted): ${err instanceof Error ? err.message : err}`,
    )
    throw err
  }

  // All copies succeeded — commit tracker in a single atomic write.
  const tracker = await readTracker(catalogPath)
  tracker.operations = tracker.operations.filter(
    (o) => !(o.customType === 'agent' && o.customId === 'manager'),
  )
  tracker.operations.push(...stagedOps)
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
