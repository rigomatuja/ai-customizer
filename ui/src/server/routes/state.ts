import { Hono } from 'hono'
import {
  ProjectCreateInputSchema,
  ProjectUpdateInputSchema,
  ToolsOverrideSchema,
} from '../../shared/schemas'
import type { AppStateResponse, ProjectsResponse } from '../../shared/types'
import { getCatalogPath } from '../catalog/paths'
import { ensureUserConfigDir, initUserConfig, readUserConfig, updateToolsOverride } from '../state/config'
import { userConfigDir } from '../state/paths'
import { createProject, deleteProject, listProjects, updateProject } from '../state/projects'
import { apiError } from './_errors'

export const stateRoutes = new Hono()

stateRoutes.get('/', async (c) => {
  const config = await readUserConfig()
  let catalogPath: string
  let catalogError: string | null = null
  try {
    catalogPath = getCatalogPath()
  } catch (err) {
    catalogPath = ''
    catalogError = err instanceof Error ? err.message : String(err)
  }
  const response: AppStateResponse & { catalogError?: string } = {
    initialized: config !== null,
    config,
    catalogPath,
    userConfigDir: userConfigDir(),
  }
  if (catalogError) response.catalogError = catalogError
  return c.json(response)
})

stateRoutes.post('/init', async (c) => {
  await ensureUserConfigDir()
  const catalogPath = getCatalogPath()
  const cfg = await initUserConfig({ catalogPath })
  return c.json({ initialized: true, config: cfg })
})

stateRoutes.post('/tools-override', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = ToolsOverrideSchema.nullable().safeParse(body)
  if (!parsed.success) {
    return c.json(apiError('invalid tools override', 'validation-failed', parsed.error.issues), 400)
  }
  const updated = await updateToolsOverride(parsed.data)
  if (!updated) return c.json(apiError('config not initialized', 'not-initialized'), 409)
  return c.json({ config: updated })
})

stateRoutes.get('/projects', async (c) => {
  const projects = await listProjects()
  const response: ProjectsResponse = { projects }
  return c.json(response)
})

stateRoutes.post('/projects', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = ProjectCreateInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(apiError('invalid project', 'validation-failed', parsed.error.issues), 400)
  }
  const entry = await createProject(parsed.data)
  return c.json(entry, 201)
})

stateRoutes.put('/projects/:id', async (c) => {
  const id = c.req.param('id')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = ProjectUpdateInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(apiError('invalid project update', 'validation-failed', parsed.error.issues), 400)
  }
  const updated = await updateProject(id, parsed.data)
  if (!updated) return c.json(apiError('project not found', 'not-found'), 404)
  return c.json(updated)
})

stateRoutes.delete('/projects/:id', async (c) => {
  const id = c.req.param('id')
  const force = c.req.query('force') === '1' || c.req.query('force') === 'true'
  const result = await deleteProject(id, force)
  if (result.notFound) return c.json(apiError('project not found', 'not-found'), 404)
  if (!result.ok && result.blocker) {
    return c.json(apiError(result.blocker.message, result.blocker.code, result.blocker.installedCustoms), 409)
  }
  return c.json({ deleted: true })
})
