import { Hono } from 'hono'
import type { TrackerResponse } from '../../shared/types'
import { loadCatalog } from '../catalog/loader'
import { getCatalogPath } from '../catalog/paths'
import { listBackups } from '../installer/backup'
import { executePlan } from '../installer/executor'
import { computePlan } from '../installer/planner'
import { listHistory } from '../state/history'
import { listInstallations } from '../state/installations'
import { listProjects } from '../state/projects'
import { readTracker } from '../state/tracker'

export const applyRoutes = new Hono()

async function buildContext() {
  const catalogPath = getCatalogPath()
  const [catalog, installations, tracker, projects] = await Promise.all([
    loadCatalog(catalogPath),
    listInstallations(),
    readTracker(catalogPath),
    listProjects(),
  ])
  return { catalogPath, catalog, installations, tracker, projects }
}

applyRoutes.get('/plan', async (c) => {
  const ctx = await buildContext()
  const plan = computePlan({
    catalogPath: ctx.catalogPath,
    catalog: ctx.catalog,
    installations: ctx.installations,
    tracker: ctx.tracker,
    projects: ctx.projects,
  })
  return c.json(plan)
})

applyRoutes.post('/', async (c) => {
  const ctx = await buildContext()
  const plan = computePlan({
    catalogPath: ctx.catalogPath,
    catalog: ctx.catalog,
    installations: ctx.installations,
    tracker: ctx.tracker,
    projects: ctx.projects,
  })
  const projectPaths = ctx.projects.map((p) => p.path)
  const response = await executePlan({ plan, catalogPath: ctx.catalogPath, projectPaths })
  return c.json(response)
})

applyRoutes.get('/history', async (c) => {
  const entries = await listHistory()
  return c.json({ entries })
})

applyRoutes.get('/tracker', async (c) => {
  const catalogPath = getCatalogPath()
  const tracker = await readTracker(catalogPath)
  const response: TrackerResponse = { tracker }
  return c.json(response)
})

applyRoutes.get('/backups', async (c) => {
  const backups = await listBackups()
  return c.json({ backups })
})
