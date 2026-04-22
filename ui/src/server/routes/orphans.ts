import { Hono } from 'hono'
import { loadCatalog } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'
import {
  computeOrphans,
  forceUninstallOrphan,
  forceUninstallPatchOrphan,
  PatchOrphanRestoreError,
} from '../installer/orphans'
import { readTracker } from '../state/tracker'
import { apiError } from './_errors'

export const orphansRoutes = new Hono()

orphansRoutes.get('/', async (c) => {
  const catalogPath = getCatalogPath()
  const [tracker, catalog] = await Promise.all([readTracker(catalogPath), loadCatalog(catalogPath)])
  const orphans = computeOrphans(tracker, catalog)
  return c.json({ orphans })
})

orphansRoutes.delete('/:customType/:customId', async (c) => {
  const customType = c.req.param('customType')
  const customId = c.req.param('customId')
  if (customType !== 'skill' && customType !== 'agent') {
    return c.json(apiError(`invalid customType: ${customType}`, 'bad-request'), 400)
  }
  const result = await forceUninstallOrphan({ customType, customId })
  if (result.notFound) return c.json(apiError('no tracker entries', 'not-found'), 404)
  return c.json(result)
})

orphansRoutes.delete('/patch/:target', async (c) => {
  const target = c.req.param('target')
  if (target !== 'CLAUDE.md' && target !== 'AGENTS.md') {
    return c.json(apiError(`invalid target: ${target}`, 'bad-request'), 400)
  }
  const force = c.req.query('force') === '1' || c.req.query('force') === 'true'
  try {
    const result = await forceUninstallPatchOrphan(target, { force })
    if (result.notFound) return c.json(apiError('no patch tracker entry', 'not-found'), 404)
    return c.json(result)
  } catch (err) {
    if (err instanceof PatchOrphanRestoreError) {
      return c.json(
        apiError(err.message, 'restore-impossible', {
          target: err.target,
          masterPath: err.masterPath,
          originalBackup: err.originalBackup,
        }),
        409,
      )
    }
    throw err
  }
})
