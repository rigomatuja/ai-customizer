import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getCatalogPath } from './catalog/paths'
import { applyRoutes } from './routes/apply'
import { catalogRoutes } from './routes/catalog'
import { customsRoutes } from './routes/customs'
import { guideRoutes } from './routes/guide'
import { installationsRoutes } from './routes/installations'
import { managerRoutes } from './routes/manager'
import { orphansRoutes } from './routes/orphans'
import { stateRoutes } from './routes/state'
import { toolsRoutes } from './routes/tools'
import { hookRegistryRoutes, triggersRoutes } from './routes/triggers'
import { ensureUserConfigDir } from './state/config'
import { acquireLock } from './state/lock'

const app = new Hono()

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'ai-customizer',
    version: '1.3.0',
    milestone: 'M8',
  }),
)

app.route('/api/catalog', catalogRoutes)
app.route('/api/customs', customsRoutes)
app.route('/api/state', stateRoutes)
app.route('/api/tools', toolsRoutes)
app.route('/api/installations', installationsRoutes)
app.route('/api/apply', applyRoutes)
app.route('/api/guide', guideRoutes)
app.route('/api/triggers', triggersRoutes)
app.route('/api/hook-registry', hookRegistryRoutes)
app.route('/api/manager', managerRoutes)
app.route('/api/orphans', orphansRoutes)

const port = Number(process.env.PORT) || 3236
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
