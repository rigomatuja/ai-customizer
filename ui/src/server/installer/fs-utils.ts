import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Expand a leading `~` to the user's home directory.
 *
 * Node's `path.join` does NOT expand `~` — that's a shell convention.
 * If a stored path like `~/Documents/foo` reaches `path.join` un-expanded,
 * the tilde becomes a LITERAL directory name relative to the process's
 * cwd. For the customizer, that meant project-scoped installs silently
 * landed at `<server_cwd>/~/Documents/...` — invisible to the actual
 * tool that scans the project's real path.
 *
 * Always run user-supplied paths through this helper before joining or
 * creating files.
 */
export function expandHome(p: string): string {
  if (!p) return p
  if (p === '~') return os.homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
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
  // Guard against symlink misconfigurations where src and dst resolve
  // to the same inode — copying onto itself can truncate the source.
  // The dst may not exist yet; in that case realpath of dst throws,
  // which is fine (no aliasing possible).
  const fromReal = await fs.realpath(from).catch(() => path.resolve(from))
  const toReal = await fs.realpath(to).catch(() => path.resolve(to))
  if (fromReal === toReal) {
    throw new Error(
      `copyFile: source and destination resolve to the same path (${fromReal}) — refusing to clobber source`,
    )
  }
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

/**
 * Pick the correct walk-up boundary for `deleteFileAndCleanup`.
 *
 * Given candidate roots (typically `[home, ...projectPaths]`), return
 * the LONGEST one that is a strict ancestor of `destPath`. Longest-match
 * is important when a project is nested under `$HOME` — we want the
 * walk-up to stop at the PROJECT root, not at `$HOME`.
 *
 * Falls back to `$HOME` when no candidate matches. This is a safety
 * net: callers should pass a list that covers every scope they might
 * have installed to.
 */
export function pickCleanupBoundary(destPath: string, candidates: string[]): string {
  const home = os.homedir()
  let best: string | null = null
  for (const c of candidates) {
    if (!c) continue
    // `c + path.sep` prevents `/foo` from matching `/foobar`.
    if (destPath.startsWith(c + path.sep) && (!best || c.length > best.length)) {
      best = c
    }
  }
  return best ?? home
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
