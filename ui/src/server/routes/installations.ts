import { Hono } from 'hono'
import { InstallationEntrySchema } from '../../shared/schemas'
import type { InstallationsResponse } from '../../shared/types'
import {
  listInstallations,
  removeInstallation,
  upsertInstallation,
} from '../state/installations'

export const installationsRoutes = new Hono()

installationsRoutes.get('/', async (c) => {
  const installations = await listInstallations()
  const response: InstallationsResponse = { installations }
  return c.json(response)
})

installationsRoutes.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body', code: 'bad-request' }, 400)
  }
  const parsed = InstallationEntrySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'invalid installation', code: 'validation-failed', details: parsed.error.issues },
      400,
    )
  }
  const entry = await upsertInstallation(parsed.data)
  return c.json(entry)
})

installationsRoutes.delete('/:customType/:customId', async (c) => {
  const customType = c.req.param('customType')
  const customId = c.req.param('customId')
  if (customType !== 'skill' && customType !== 'agent') {
    return c.json({ error: `invalid customType: ${customType}`, code: 'bad-request' }, 400)
  }
  const ok = await removeInstallation(customType, customId)
  if (!ok) return c.json({ error: 'installation not found', code: 'not-found' }, 404)
  return c.json({ deleted: true })
})
