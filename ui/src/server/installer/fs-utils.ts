import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Write a JSON file atomically: write to `${path}.tmp-<random>`, then
 * rename. Rename is atomic on POSIX filesystems — a reader either sees
 * the old file or the new one, never a partial write.
 *
 * Crash mid-write leaves the temp file on disk (orphan) but the real
 * file is untouched. Orphan temp files are harmless and cleaned up by
 * the next successful write or by the user manually.
 */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await ensureDir(dir)
  const tmp = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  const contents = JSON.stringify(data, null, 2) + '\n'
  try {
    await fs.writeFile(tmp, contents, 'utf8')
    await fs.rename(tmp, filePath)
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined)
    throw err
  }
}

export async function copyFile(from: string, to: string): Promise<void> {
  await ensureDir(path.dirname(to))
  await fs.copyFile(from, to)
}

/**
 * Delete a file and walk up the parent chain removing empty directories
 * until we hit a non-empty one or the `stopAt` boundary.
 */
export async function deleteFileAndCleanup(target: string, stopAt: string): Promise<void> {
  if (existsSync(target)) {
    await fs.unlink(target).catch(() => undefined)
  }
  let dir = path.dirname(target)
  const stop = path.resolve(stopAt)
  while (dir.startsWith(stop) && dir !== stop) {
    try {
      const entries = await fs.readdir(dir)
      if (entries.length > 0) break
      await fs.rmdir(dir)
    } catch {
      break
    }
    dir = path.dirname(dir)
  }
}

export async function hashFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return 'sha256:' + createHash('sha256').update(buf).digest('hex')
}

export async function hashFileIfExists(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null
  return hashFile(filePath)
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
