import { Hono } from 'hono'
import type { CatalogOverview } from '../../shared/types'
import { loadCatalog } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'
import { apiError } from './_errors'

export const catalogRoutes = new Hono()

catalogRoutes.get('/', async (c) => {
  try {
    const catalogPath = getCatalogPath()
    const loaded = await loadCatalog(catalogPath)

    const counts = {
      skills: loaded.customs.filter((x) => x.type === 'skill').length,
      agents: loaded.customs.filter((x) => x.type === 'agent').length,
      patches: loaded.customs.filter((x) => x.type === 'patch').length,
      hooks: loaded.customs.filter((x) => x.hasHook).length,
      invalid: loaded.customs.filter((x) => !x.valid).length,
    }

    const overview: CatalogOverview = {
      schemaVersion: loaded.config.schemaVersion,
      name: loaded.config.name,
      catalogPath,
      counts,
      triggers: loaded.triggers,
      guide: loaded.guide,
      config: loaded.config,
      issues: loaded.issues,
    }

    return c.json(overview)
  } catch (err) {
    return c.json(
      apiError(err instanceof Error ? err.message : 'failed to load catalog', 'catalog-load-failed'),
      500,
    )
  }
})
