import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getCatalogPath } from './catalog/paths'
import { catalogRoutes } from './routes/catalog'
import { customsRoutes } from './routes/customs'

const app = new Hono()

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'ai-customizer',
    version: '0.3.0',
    milestone: 'M3',
  }),
)

app.route('/api/catalog', catalogRoutes)
app.route('/api/customs', customsRoutes)

const port = Number(process.env.PORT) || 3000
const hostname = '127.0.0.1'

try {
  const catalogPath = getCatalogPath()
  console.log(`[ai-customizer] catalog: ${catalogPath}`)
} catch (err) {
  console.error(`[ai-customizer] WARNING: ${err instanceof Error ? err.message : err}`)
  console.error('[ai-customizer] server will boot but catalog routes will fail until CATALOG_PATH is set.')
}

console.log(`[ai-customizer] server listening on http://${hostname}:${port}`)

serve({
  fetch: app.fetch,
  port,
  hostname,
})
