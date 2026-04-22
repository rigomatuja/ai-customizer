import { Hono } from 'hono'
import { z } from 'zod'
import { Tool } from '../../shared/schemas'
import {
  getManagerStatus,
  installManager,
  uninstallManager,
} from '../installer/manager-install'
import { apiError } from './_errors'

export const managerRoutes = new Hono()

managerRoutes.get('/', async (c) => {
  const status = await getManagerStatus()
  return c.json(status)
})

const InstallBodySchema = z.object({ tools: z.array(Tool).min(1) })

managerRoutes.post('/install', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = InstallBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('invalid tools', 'validation-failed', parsed.error.issues),
      400,
    )
  }
  try {
    const result = await installManager(parsed.data.tools)
    return c.json(result)
  } catch (err) {
    return c.json(
      apiError(err instanceof Error ? err.message : String(err), 'install-failed'),
      500,
    )
  }
})

managerRoutes.post('/uninstall', async (c) => {
  const result = await uninstallManager()
  return c.json(result)
})
