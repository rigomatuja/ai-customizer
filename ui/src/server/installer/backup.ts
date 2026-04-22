import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as tar from 'tar'
import { userConfigPaths } from '../state/paths'

const MAX_BACKUPS = 10

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function realTargetsFor(projectPaths: string[]): string[] {
  const home = os.homedir()
  const candidates = [
    path.join(home, '.claude'),
    path.join(home, '.config', 'opencode'),
    ...projectPaths.flatMap((p) => [path.join(p, '.claude'), path.join(p, '.opencode')]),
  ]
  return candidates.filter((p) => existsSync(p))
}

export interface BackupResult {
  path: string
  sizeBytes: number
}

export async function createBackup(projectPaths: string[]): Promise<BackupResult | null> {
  const p = userConfigPaths()
  await fs.mkdir(p.backups, { recursive: true })

  const targets = realTargetsFor(projectPaths)
  if (targets.length === 0) return null

  const fileName = `apply-${timestamp()}.tar.gz`
  const filePath = path.join(p.backups, fileName)

  const cwd = '/'
  const relTargets = targets.map((t) => path.relative(cwd, t))

  await tar.c(
    {
      gzip: true,
      file: filePath,
      cwd,
      portable: true,
      preservePaths: false,
    },
    relTargets,
  )

  const stat = await fs.stat(filePath)

  await rotateBackups()

  return { path: filePath, sizeBytes: stat.size }
}

async function rotateBackups(): Promise<void> {
  const p = userConfigPaths()
  if (!existsSync(p.backups)) return
  const entries = await fs.readdir(p.backups)
  const tars = entries.filter((n) => n.endsWith('.tar.gz')).sort()
  if (tars.length <= MAX_BACKUPS) return
  const toRemove = tars.slice(0, tars.length - MAX_BACKUPS)
  await Promise.all(
    toRemove.map((name) => fs.unlink(path.join(p.backups, name)).catch(() => undefined)),
  )
}

export async function restoreBackup(backupPath: string): Promise<void> {
  if (!existsSync(backupPath)) throw new Error(`backup not found: ${backupPath}`)
  await tar.x({ file: backupPath, cwd: '/', preservePaths: false })
}

export async function listBackups(): Promise<Array<{ name: string; path: string; sizeBytes: number; createdAt: string }>> {
  const p = userConfigPaths()
  if (!existsSync(p.backups)) return []
  const entries = await fs.readdir(p.backups)
  const tars = entries.filter((n) => n.endsWith('.tar.gz')).sort().reverse()
  const result: Array<{ name: string; path: string; sizeBytes: number; createdAt: string }> = []
  for (const name of tars) {
    const full = path.join(p.backups, name)
    const stat = await fs.stat(full)
    result.push({ name, path: full, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() })
  }
  return result
}
