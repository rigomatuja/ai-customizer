import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'ai-customizer',
    version: '0.2.0',
    milestone: 'M2',
  }),
)

const port = Number(process.env.PORT) || 3000
const hostname = '127.0.0.1'

console.log(`[ai-customizer] server listening on http://${hostname}:${port}`)

serve({
  fetch: app.fetch,
  port,
  hostname,
})
