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

  // Signal handlers must wait for the async release BEFORE calling
  // process.exit, otherwise the lock file can be left in a
  // non-cleaned state and the next startup hits a stale lock.
  let exiting = false
  const cleanup = async (signal: string) => {
    if (exiting) return
    exiting = true
    try {
      await releaseLock()
    } catch {
      // Best-effort: lock is stale-cleared after 60s by proper-lockfile.
    }
    // Re-raise the signal's default handler behavior: exit cleanly.
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }

  process.once('SIGINT', () => {
    void cleanup('SIGINT')
  })
  process.once('SIGTERM', () => {
    void cleanup('SIGTERM')
  })
  // beforeExit is synchronous-only in practice; best we can do is
  // fire the cleanup without awaiting. If the user Ctrl+C's this
  // matters less because SIGINT is already handled above.
  process.once('beforeExit', () => {
    void releaseLock().catch(() => undefined)
  })
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
