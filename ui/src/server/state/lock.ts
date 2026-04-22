import { existsSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import lockfile from 'proper-lockfile'
import { userConfigPaths } from './paths'

let release: (() => Promise<void>) | null = null

interface LockMetadata {
  pid: number
  port: number
  startedAt: string
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Acquire the UI lock. Throws if another instance holds it.
 * The lock file contains JSON metadata (pid, port, startedAt) so the
 * error message can be informative.
 */
export async function acquireLock(port: number): Promise<void> {
  const p = userConfigPaths()
  await ensureDir(p.root)

  if (!existsSync(p.lock)) {
    writeFileSync(p.lock, '{}', 'utf8')
  }

  try {
    release = await lockfile.lock(p.lock, {
      stale: 60_000,
      retries: 0,
    })
  } catch (err) {
    let existingMeta: LockMetadata | null = null
    try {
      const raw = await fs.readFile(p.lock, 'utf8')
      existingMeta = JSON.parse(raw) as LockMetadata
    } catch {
      // ignore, report generic
    }
    const detail = existingMeta
      ? `Another UI appears to be running (pid ${existingMeta.pid}, port ${existingMeta.port}, started ${existingMeta.startedAt})`
      : (err instanceof Error ? err.message : String(err))
    throw new Error(`Could not acquire UI lock: ${detail}`)
  }

  const meta: LockMetadata = {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
  }
  await fs.writeFile(p.lock, JSON.stringify(meta, null, 2), 'utf8')

  const cleanup = async () => {
    await releaseLock().catch(() => undefined)
    process.exit(0)
  }

  process.once('SIGINT', () => void cleanup())
  process.once('SIGTERM', () => void cleanup())
  process.once('beforeExit', () => void releaseLock().catch(() => undefined))
}

export async function releaseLock(): Promise<void> {
  if (release) {
    const r = release
    release = null
    await r()
  }
  const p = userConfigPaths()
  try {
    await fs.writeFile(p.lock, '{}', 'utf8')
  } catch {
    // ignore — lock file may already be cleaned up
  }
}
