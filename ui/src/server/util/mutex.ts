/**
 * Simple per-key async mutex.
 *
 * JavaScript is single-threaded, but async operations interleave.
 * Two HTTP handlers can both `await readFile()` and then `await
 * writeFile()` — the writes can happen in either order, losing one
 * update. This module serializes any async work keyed by a resource
 * identifier (catalog path, tracker path, etc.).
 *
 * Implementation: each key maps to the tail promise of its queue.
 * A new caller waits for the current tail, runs its work, and
 * replaces the tail with its own completion. `.catch(() => {})` on
 * the stored tail guarantees one failure doesn't poison the queue.
 *
 * Usage:
 *   await withLock('my-key', async () => {
 *     const data = await read()
 *     data.value++
 *     await write(data)
 *   })
 */
const locks = new Map<string, Promise<unknown>>()

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()

  // Build the new tail: wait for prev, then run fn. Store a
  // swallow-error wrapper so a rejection in one caller doesn't
  // propagate to the next (but the original mine still rejects to
  // its own awaiter).
  const mine = prev.then(fn, fn)
  locks.set(
    key,
    mine.then(
      () => undefined,
      () => undefined,
    ),
  )

  try {
    return await mine
  } finally {
    // Best-effort cleanup: if the map still points at our tail
    // (nothing chained after us), remove it to prevent leak on
    // long-lived servers with many unique keys.
    // We can't compare directly (we stored a .then wrapper), so we
    // just skip aggressive cleanup. Map size stays bounded by the
    // number of distinct catalog/tracker paths — small.
  }
}
