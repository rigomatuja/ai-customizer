import { Hono } from 'hono'
import { CustomType } from '../../shared/schemas'
import type { CustomsListResponse } from '../../shared/types'
import { loadCatalog, loadCustomDetail } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'
import { apiError } from './_errors'

export const customsRoutes = new Hono()

customsRoutes.get('/', async (c) => {
  try {
    const catalogPath = getCatalogPath()
    const loaded = await loadCatalog(catalogPath)
    const response: CustomsListResponse = { customs: loaded.customs }
    return c.json(response)
  } catch (err) {
    return c.json(
      apiError(err instanceof Error ? err.message : 'failed to load customs', 'catalog-load-failed'),
      500,
    )
  }
})

customsRoutes.get('/:type/:id', async (c) => {
  const typeParam = c.req.param('type')
  const id = c.req.param('id')

  const typeParse = CustomType.safeParse(typeParam)
  if (!typeParse.success) {
    return c.json(apiError(`invalid type "${typeParam}"`, 'invalid-type'), 400)
  }

  try {
    const catalogPath = getCatalogPath()
    const detail = await loadCustomDetail(catalogPath, typeParse.data, id)
    if (!detail) {
      return c.json(apiError(`custom not found: ${typeParse.data}:${id}`, 'not-found'), 404)
    }
    return c.json(detail)
  } catch (err) {
    return c.json(
      apiError(err instanceof Error ? err.message : 'failed to load custom', 'custom-load-failed'),
      500,
    )
  }
})
