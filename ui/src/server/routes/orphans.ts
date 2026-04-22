import { Hono } from 'hono'
import { loadCatalog } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'
import {
  computeOrphans,
  forceUninstallOrphan,
  forceUninstallPatchOrphan,
} from '../installer/orphans'
import { readTracker } from '../state/tracker'

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
    return c.json({ error: `invalid customType: ${customType}`, code: 'bad-request' }, 400)
  }
  const result = await forceUninstallOrphan({ customType, customId })
  if (result.notFound) return c.json({ error: 'no tracker entries', code: 'not-found' }, 404)
  return c.json(result)
})

orphansRoutes.delete('/patch/:target', async (c) => {
  const target = c.req.param('target')
  if (target !== 'CLAUDE.md' && target !== 'AGENTS.md') {
    return c.json({ error: `invalid target: ${target}`, code: 'bad-request' }, 400)
  }
  const result = await forceUninstallPatchOrphan(target)
  if (result.notFound) return c.json({ error: 'no patch tracker entry', code: 'not-found' }, 404)
  return c.json(result)
})
