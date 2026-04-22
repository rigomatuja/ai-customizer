import { Hono } from 'hono'
import { z } from 'zod'
import { addTrigger, readTriggers, removeTrigger } from '../catalog/triggers'
import { getCatalogPath } from '../catalog/paths'
import { readGlobalHookRegistry } from '../installer/hook-registry'

export const triggersRoutes = new Hono()

triggersRoutes.get('/', async (c) => {
  const catalogPath = getCatalogPath()
  const file = await readTriggers(catalogPath)
  return c.json(file)
})

const TriggerBodySchema = z.object({
  trigger: z.string().min(1).max(200).regex(/^[a-z][a-z0-9-]*:[^\s]+$/i, {
    message: 'trigger must match "<type>:<target>" (e.g. "phase:sdd-pipeline:post-apply")',
  }),
})

triggersRoutes.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body', code: 'bad-request' }, 400)
  }
  const parsed = TriggerBodySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'invalid trigger', code: 'validation-failed', details: parsed.error.issues },
      400,
    )
  }
  const catalogPath = getCatalogPath()
  const file = await addTrigger(catalogPath, parsed.data.trigger)
  return c.json(file)
})

triggersRoutes.delete('/', async (c) => {
  const trigger = c.req.query('trigger')
  if (!trigger) {
    return c.json({ error: 'trigger query param required', code: 'bad-request' }, 400)
  }
  const catalogPath = getCatalogPath()
  const result = await removeTrigger(catalogPath, trigger)
  if (!result) return c.json({ error: 'trigger not found', code: 'not-found' }, 404)
  return c.json(result)
})

export const hookRegistryRoutes = new Hono()

hookRegistryRoutes.get('/', async (c) => {
  const registry = await readGlobalHookRegistry()
  return c.json(registry)
})
