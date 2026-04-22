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

export const stateRoutes = new Hono()

stateRoutes.get('/', async (c) => {
  const config = await readUserConfig()
  const catalogPath = getCatalogPath()
  const response: AppStateResponse = {
    initialized: config !== null,
    config,
    catalogPath,
    userConfigDir: userConfigDir(),
  }
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
    return c.json({ error: 'invalid JSON body', code: 'bad-request' }, 400)
  }
  const parsed = ToolsOverrideSchema.nullable().safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid tools override',
        code: 'validation-failed',
        details: parsed.error.issues,
      },
      400,
    )
  }
  const updated = await updateToolsOverride(parsed.data)
  if (!updated) return c.json({ error: 'config not initialized', code: 'not-initialized' }, 409)
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
    return c.json({ error: 'invalid JSON body', code: 'bad-request' }, 400)
  }
  const parsed = ProjectCreateInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid project',
        code: 'validation-failed',
        details: parsed.error.issues,
      },
      400,
    )
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
    return c.json({ error: 'invalid JSON body', code: 'bad-request' }, 400)
  }
  const parsed = ProjectUpdateInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid project update',
        code: 'validation-failed',
        details: parsed.error.issues,
      },
      400,
    )
  }
  const updated = await updateProject(id, parsed.data)
  if (!updated) return c.json({ error: 'project not found', code: 'not-found' }, 404)
  return c.json(updated)
})

stateRoutes.delete('/projects/:id', async (c) => {
  const id = c.req.param('id')
  const force = c.req.query('force') === '1' || c.req.query('force') === 'true'
  const result = await deleteProject(id, force)
  if (result.notFound) return c.json({ error: 'project not found', code: 'not-found' }, 404)
  if (!result.ok && result.blocker) {
    return c.json({ error: result.blocker.message, code: result.blocker.code, details: result.blocker.installedCustoms }, 409)
  }
  return c.json({ deleted: true })
})
