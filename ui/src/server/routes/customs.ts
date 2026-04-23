import { Hono } from 'hono'
import { z } from 'zod'
import { CustomType } from '../../shared/schemas'
import type { CustomsListResponse } from '../../shared/types'
import { AgentModelChangeError, changeAgentModel } from '../catalog/agent-model'
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

// -----------------------------------------------------------------------
// Change the model of an agent custom. Patch-bumps to a new version.
// This is the ONLY UI-driven write into customizations/** content —
// explicitly documented as the single exception to the rule.
// -----------------------------------------------------------------------

// `null` unsets the model field in the target tool's frontmatter.
// Omitted tool keys are left untouched.
const ChangeModelBodySchema = z.object({
  claude: z.string().min(1).nullable().optional(),
  opencode: z.string().min(1).nullable().optional(),
  changelogNote: z.string().min(1).optional(),
})

customsRoutes.post('/agent/:id/model', async (c) => {
  const id = c.req.param('id')

  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = ChangeModelBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return c.json(apiError('invalid model-change body', 'validation-failed', parsed.error.issues), 400)
  }
  if (parsed.data.claude === undefined && parsed.data.opencode === undefined) {
    return c.json(apiError('at least one of claude/opencode must be provided', 'no-op'), 400)
  }

  try {
    const catalogPath = getCatalogPath()
    const result = await changeAgentModel({ catalogPath, customId: id, ...parsed.data })
    return c.json(result)
  } catch (err) {
    if (err instanceof AgentModelChangeError) {
      const status =
        err.code === 'not-found'
          ? 404
          : err.code === 'wrong-type' ||
              err.code === 'version-missing' ||
              err.code === 'tool-variant-missing' ||
              err.code === 'no-effective-change'
            ? 409
            : 400
      return c.json(apiError(err.message, err.code), status)
    }
    return c.json(
      apiError(err instanceof Error ? err.message : 'failed to change model', 'change-model-failed'),
      500,
    )
  }
})
