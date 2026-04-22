import fs from 'node:fs/promises'
import {
  ApplicationGuideSchema,
  type ApplicationGuide,
  type GuideEntry,
  type PatchMasterName,
} from '../../shared/schemas'
import { writeJsonAtomic } from '../installer/fs-utils'
import { catalogPaths } from './paths'

const EMPTY: ApplicationGuide = {
  schemaVersion: '1.0',
  targets: { 'CLAUDE.md': [], 'AGENTS.md': [] },
}

export async function readGuide(catalogRoot: string): Promise<ApplicationGuide> {
  const p = catalogPaths(catalogRoot)
  try {
    const raw = await fs.readFile(p.guide, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const result = ApplicationGuideSchema.safeParse(parsed)
    return result.success ? result.data : EMPTY
  } catch {
    return EMPTY
  }
}

export async function writeGuide(catalogRoot: string, guide: ApplicationGuide): Promise<void> {
  const p = catalogPaths(catalogRoot)
  const normalized = normalizeOrder(guide)
  await writeJsonAtomic(p.guide, normalized)
}

function normalizeOrder(guide: ApplicationGuide): ApplicationGuide {
  const next: ApplicationGuide = {
    schemaVersion: guide.schemaVersion,
    targets: { 'CLAUDE.md': [], 'AGENTS.md': [] },
  }
  for (const target of ['CLAUDE.md', 'AGENTS.md'] as const) {
    const sorted = [...guide.targets[target]].sort((a, b) => a.order - b.order)
    next.targets[target] = sorted.map((entry, i) => ({ ...entry, order: i }))
  }
  return next
}

export async function upsertGuideEntry(
  catalogRoot: string,
  target: PatchMasterName,
  entry: GuideEntry,
): Promise<ApplicationGuide> {
  const guide = await readGuide(catalogRoot)
  const list = guide.targets[target]
  const idx = list.findIndex((e) => e.patchId === entry.patchId)
  if (idx === -1) {
    const order = list.length > 0 ? Math.max(...list.map((e) => e.order)) + 1 : 0
    list.push({ ...entry, order })
  } else {
    list[idx] = { ...list[idx]!, ...entry }
  }
  await writeGuide(catalogRoot, guide)
  return guide
}

export async function removeGuideEntry(
  catalogRoot: string,
  target: PatchMasterName,
  patchId: string,
): Promise<ApplicationGuide | null> {
  const guide = await readGuide(catalogRoot)
  const before = guide.targets[target].length
  guide.targets[target] = guide.targets[target].filter((e) => e.patchId !== patchId)
  if (guide.targets[target].length === before) return null
  await writeGuide(catalogRoot, guide)
  return guide
}

export class ReorderMismatchError extends Error {
  constructor(
    public missing: string[],
    public extra: string[],
  ) {
    super(
      `reorder input is not a permutation of current entries — missing: [${missing.join(', ')}], extra: [${extra.join(', ')}]`,
    )
    this.name = 'ReorderMismatchError'
  }
}

export async function reorderGuide(
  catalogRoot: string,
  target: PatchMasterName,
  patchIds: string[],
): Promise<ApplicationGuide> {
  const guide = await readGuide(catalogRoot)
  const list = guide.targets[target]
  const currentIds = new Set(list.map((e) => e.patchId))
  const providedIds = new Set(patchIds)

  const missing = [...currentIds].filter((id) => !providedIds.has(id))
  const extra = [...providedIds].filter((id) => !currentIds.has(id))
  if (missing.length > 0 || extra.length > 0) {
    throw new ReorderMismatchError(missing, extra)
  }

  const byId = new Map(list.map((e) => [e.patchId, e]))
  const reordered: GuideEntry[] = patchIds.map((id, i) => ({ ...byId.get(id)!, order: i }))
  guide.targets[target] = reordered
  await writeGuide(catalogRoot, guide)
  return guide
}
