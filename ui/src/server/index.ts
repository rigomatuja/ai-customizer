import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getCatalogPath } from './catalog/paths'
import { catalogRoutes } from './routes/catalog'
import { customsRoutes } from './routes/customs'
import { stateRoutes } from './routes/state'
import { toolsRoutes } from './routes/tools'
import { ensureUserConfigDir } from './state/config'
import { acquireLock } from './state/lock'

const app = new Hono()

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'ai-customizer',
    version: '0.4.0',
    milestone: 'M4',
  }),
)

app.route('/api/catalog', catalogRoutes)
app.route('/api/customs', customsRoutes)
app.route('/api/state', stateRoutes)
app.route('/api/tools', toolsRoutes)

const port = Number(process.env.PORT) || 3000
const hostname = '127.0.0.1'

async function bootstrap() {
  await ensureUserConfigDir()

  try {
    await acquireLock(port)
  } catch (err) {
    console.error(`[ai-customizer] ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

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
}

void bootstrap()
