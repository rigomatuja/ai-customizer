import { Hono } from 'hono'
import { GuideEntrySchema, PatchMasterName } from '../../shared/schemas'
import { z } from 'zod'
import { getCatalogPath } from '../catalog/paths'
import {
  readGuide,
  removeGuideEntry,
  reorderGuide,
  ReorderMismatchError,
  upsertGuideEntry,
} from '../catalog/guide'
import { apiError } from './_errors'

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
    return c.json(apiError(`invalid target: ${targetParam}`, 'bad-request'), 400)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = GuideEntrySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('invalid guide entry', 'validation-failed', parsed.error.issues),
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
    return c.json(apiError(`invalid target: ${targetParam}`, 'bad-request'), 400)
  }
  const patchId = c.req.param('patchId')
  const catalogPath = getCatalogPath()
  const guide = await removeGuideEntry(catalogPath, target.data, patchId)
  if (!guide) return c.json(apiError('entry not found', 'not-found'), 404)
  return c.json({ guide })
})

const ReorderBodySchema = z.object({ patchIds: z.array(z.string()) })

guideRoutes.post('/:target/reorder', async (c) => {
  const targetParam = c.req.param('target')
  const target = PatchMasterName.safeParse(targetParam)
  if (!target.success) {
    return c.json(apiError(`invalid target: ${targetParam}`, 'bad-request'), 400)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = ReorderBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('invalid reorder body', 'validation-failed', parsed.error.issues),
      400,
    )
  }
  const catalogPath = getCatalogPath()
  try {
    const guide = await reorderGuide(catalogPath, target.data, parsed.data.patchIds)
    return c.json({ guide })
  } catch (err) {
    if (err instanceof ReorderMismatchError) {
      return c.json(
        apiError(err.message, 'reorder-mismatch', { missing: err.missing, extra: err.extra }),
        400,
      )
    }
    throw err
  }
})
