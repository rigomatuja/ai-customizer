import { Hono } from 'hono'
import { CustomType } from '../../shared/schemas'
import type { CustomsListResponse } from '../../shared/types'
import { loadCatalog, loadCustomDetail } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'

export const customsRoutes = new Hono()

customsRoutes.get('/', async (c) => {
  try {
    const catalogPath = getCatalogPath()
    const loaded = await loadCatalog(catalogPath)
    const response: CustomsListResponse = { customs: loaded.customs }
    return c.json(response)
  } catch (err) {
    return c.json(
      {
        error: err instanceof Error ? err.message : 'failed to load customs',
        code: 'catalog-load-failed',
      },
      500,
    )
  }
})

customsRoutes.get('/:type/:id', async (c) => {
  const typeParam = c.req.param('type')
  const id = c.req.param('id')

  const typeParse = CustomType.safeParse(typeParam)
  if (!typeParse.success) {
    return c.json({ error: `invalid type "${typeParam}"`, code: 'invalid-type' }, 400)
  }

  try {
    const catalogPath = getCatalogPath()
    const detail = await loadCustomDetail(catalogPath, typeParse.data, id)
    if (!detail) {
      return c.json({ error: `custom not found: ${typeParse.data}:${id}`, code: 'not-found' }, 404)
    }
    return c.json(detail)
  } catch (err) {
    return c.json(
      {
        error: err instanceof Error ? err.message : 'failed to load custom',
        code: 'custom-load-failed',
      },
      500,
    )
  }
})
