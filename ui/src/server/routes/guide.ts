import { Hono } from 'hono'
import { GuideEntrySchema, PatchMasterName } from '../../shared/schemas'
import { z } from 'zod'
import { getCatalogPath } from '../catalog/paths'
import { readGuide, removeGuideEntry, reorderGuide, upsertGuideEntry } from '../catalog/guide'

export const guideRoutes = new Hono()

guideRoutes.get('/', async (c) => {
  const catalogPath = getCatalogPath()
  const guide = await readGuide(catalogPath)
  return c.json({ guide })
})

guideRoutes.post('/:target/entries', async (c) => {
  const targetParam = c.req.param('target')
  const target = PatchMasterName.safeParse(targetParam)
  if (!target.success) {
    return c.json({ error: `invalid target: ${targetParam}`, code: 'bad-request' }, 400)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body', code: 'bad-request' }, 400)
  }
  const parsed = GuideEntrySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'invalid guide entry', code: 'validation-failed', details: parsed.error.issues },
      400,
    )
  }
  const catalogPath = getCatalogPath()
  const guide = await upsertGuideEntry(catalogPath, target.data, parsed.data)
  return c.json({ guide })
})

guideRoutes.delete('/:target/entries/:patchId', async (c) => {
  const targetParam = c.req.param('target')
  const target = PatchMasterName.safeParse(targetParam)
  if (!target.success) {
    return c.json({ error: `invalid target: ${targetParam}`, code: 'bad-request' }, 400)
  }
  const patchId = c.req.param('patchId')
  const catalogPath = getCatalogPath()
  const guide = await removeGuideEntry(catalogPath, target.data, patchId)
  if (!guide) return c.json({ error: 'entry not found', code: 'not-found' }, 404)
  return c.json({ guide })
})

const ReorderBodySchema = z.object({ patchIds: z.array(z.string()) })

guideRoutes.post('/:target/reorder', async (c) => {
  const targetParam = c.req.param('target')
  const target = PatchMasterName.safeParse(targetParam)
  if (!target.success) {
    return c.json({ error: `invalid target: ${targetParam}`, code: 'bad-request' }, 400)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body', code: 'bad-request' }, 400)
  }
  const parsed = ReorderBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'invalid reorder body', code: 'validation-failed', details: parsed.error.issues },
      400,
    )
  }
  const catalogPath = getCatalogPath()
  const guide = await reorderGuide(catalogPath, target.data, parsed.data.patchIds)
  return c.json({ guide })
})
