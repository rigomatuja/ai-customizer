import { Hono } from 'hono'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CatalogPathBrowseInputSchema,
  CatalogPathUpdateInputSchema,
  CatalogPathValidateInputSchema,
  ProjectCreateInputSchema,
  ProjectUpdateInputSchema,
  ToolsOverrideSchema,
} from '../../shared/schemas'
import type {
  AppStateResponse,
  CatalogPathBrowseResponse,
  CatalogPathValidateResponse,
  ProjectsResponse,
} from '../../shared/types'
import { getCatalogPath, getCatalogPathSource, setRuntimeCatalogPath } from '../catalog/paths'
import { expandHome } from '../installer/fs-utils'
import {
  ensureUserConfigDir,
  initUserConfig,
  readUserConfig,
  updateCatalogPath,
  updateToolsOverride,
} from '../state/config'
import { userConfigDir } from '../state/paths'
import { createProject, deleteProject, listProjects, updateProject } from '../state/projects'
import { apiError } from './_errors'

export const stateRoutes = new Hono()

const CATALOG_CONFIG_MARKER = path.join('.ai-customizer', 'catalog.json')

async function resolveAndValidateCatalogPath(inputRaw: string): Promise<string> {
  const trimmed = inputRaw.trim()
  if (!trimmed) {
    throw new Error('catalog path cannot be empty')
  }
  const resolved = path.resolve(expandHome(trimmed))
  if (!existsSync(resolved)) {
    throw new Error('catalog path does not exist')
  }
  const st = await fs.stat(resolved)
  if (!st.isDirectory()) {
    throw new Error('catalog path must be a directory')
  }
  const marker = path.join(resolved, CATALOG_CONFIG_MARKER)
  if (!existsSync(marker)) {
    throw new Error(`catalog marker not found at ${marker}`)
  }
  return resolved
}

function resolveInputPath(inputRaw: string): string {
  return path.resolve(expandHome(inputRaw.trim()))
}

function catalogMarkerPath(catalogRoot: string): string {
  return path.join(catalogRoot, CATALOG_CONFIG_MARKER)
}

async function isDirectory(dirPath: string): Promise<boolean> {
  const st = await fs.stat(dirPath)
  return st.isDirectory()
}

async function buildBrowseResponse(inputPath?: string): Promise<CatalogPathBrowseResponse> {
  const start = inputPath && inputPath.trim().length > 0 ? inputPath : '~'
  const resolved = resolveInputPath(start)

  if (!existsSync(resolved)) {
    throw new Error('path does not exist')
  }
  if (!(await isDirectory(resolved))) {
    throw new Error('path must be a directory')
  }

  const warnings: CatalogPathBrowseResponse['warnings'] = []
  const entries = await fs.readdir(resolved, { withFileTypes: true })
  const directories: CatalogPathBrowseResponse['directories'] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const absolute = path.join(resolved, entry.name)
    try {
      const st = await fs.stat(absolute)
      if (!st.isDirectory()) continue
      directories.push({ name: entry.name, path: absolute })
    } catch (err) {
      warnings.push({
        code: 'subdir-inaccessible',
        message: `cannot read ${absolute}: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const parentPath = path.dirname(resolved)
  const marker = catalogMarkerPath(resolved)

  return {
    path: resolved,
    parentPath: parentPath === resolved ? null : parentPath,
    directories,
    isCatalogRoot: existsSync(marker),
    warnings,
  }
}

stateRoutes.get('/', async (c) => {
  const config = await readUserConfig()
  if (!process.env.CATALOG_PATH && config?.catalogPath) {
    setRuntimeCatalogPath(config.catalogPath)
  }
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
    catalogPathSource: getCatalogPathSource(),
    catalogPathLockedByEnv: Boolean(process.env.CATALOG_PATH),
    userConfigDir: userConfigDir(),
  }
  if (catalogError) response.catalogError = catalogError
  return c.json(response)
})

stateRoutes.post('/init', async (c) => {
  await ensureUserConfigDir()
  const catalogPath = getCatalogPath()
  const cfg = await initUserConfig({ catalogPath })
  if (!process.env.CATALOG_PATH) {
    setRuntimeCatalogPath(cfg.catalogPath)
  }
  return c.json({ initialized: true, config: cfg })
})

stateRoutes.post('/catalog-path', async (c) => {
  if (process.env.CATALOG_PATH) {
    return c.json(
      apiError('catalog path is locked by CATALOG_PATH env var', 'catalog-path-locked-by-env'),
      409,
    )
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }
  const parsed = CatalogPathUpdateInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(apiError('invalid catalog path input', 'validation-failed', parsed.error.issues), 400)
  }

  let resolved: string
  try {
    resolved = await resolveAndValidateCatalogPath(parsed.data.catalogPath)
  } catch (err) {
    return c.json(apiError(err instanceof Error ? err.message : String(err), 'invalid-catalog-path'), 400)
  }

  const updated = await updateCatalogPath(resolved)
  if (!updated) return c.json(apiError('config not initialized', 'not-initialized'), 409)

  setRuntimeCatalogPath(resolved)

  const response: AppStateResponse = {
    initialized: true,
    config: updated,
    catalogPath: resolved,
    catalogPathSource: getCatalogPathSource(),
    catalogPathLockedByEnv: false,
    userConfigDir: userConfigDir(),
  }
  return c.json(response)
})

stateRoutes.post('/catalog-path/browse', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }

  const parsed = CatalogPathBrowseInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(apiError('invalid browse input', 'validation-failed', parsed.error.issues), 400)
  }

  try {
    const response = await buildBrowseResponse(parsed.data.path)
    return c.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const code = message.includes('EACCES') || message.includes('EPERM') ? 'permission-denied' : 'invalid-browse-path'
    const status = code === 'permission-denied' ? 403 : 400
    return c.json(apiError(message, code), status)
  }
})

stateRoutes.post('/catalog-path/validate', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('invalid JSON body', 'bad-request'), 400)
  }

  const parsed = CatalogPathValidateInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(apiError('invalid catalog path input', 'validation-failed', parsed.error.issues), 400)
  }

  const isEnvLocked = Boolean(process.env.CATALOG_PATH)
  const messages: CatalogPathValidateResponse['messages'] = []
  let resolvedPath: string | null = null
  let isValid = false

  try {
    resolvedPath = await resolveAndValidateCatalogPath(parsed.data.catalogPath)
    isValid = true
  } catch (err) {
    messages.push({
      level: 'error',
      code: 'invalid-catalog-path',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  let currentPath = ''
  try {
    currentPath = getCatalogPath()
  } catch {
    currentPath = ''
  }

  const isSamePath = Boolean(resolvedPath && currentPath && resolvedPath === currentPath)

  if (isEnvLocked) {
    messages.push({
      level: 'error',
      code: 'catalog-path-locked-by-env',
      message: 'CATALOG_PATH está activo y bloquea el relink desde la UI.',
    })
  }

  if (isValid && isSamePath) {
    messages.push({
      level: 'info',
      code: 'same-path',
      message: 'La ruta coincide con la actual; no habrá cambios.',
    })
  }

  if (isValid && !isSamePath) {
    messages.push(
      {
        level: 'warning',
        code: 'move-rename-intended',
        message: 'Este relink está pensado para el MISMO catálogo movido o renombrado.',
      },
      {
        level: 'warning',
        code: 'shared-state-risk',
        message: 'Si apuntas a otro catálogo distinto, pueden aparecer orphans o blockers por estado compartido de máquina.',
      },
      {
        level: 'warning',
        code: 'avoid-during-apply',
        message: 'No cambies la ruta durante Apply.',
      },
      {
        level: 'info',
        code: 'no-auto-apply',
        message: 'Este cambio no reinstala ni ejecuta Apply automáticamente.',
      },
      {
        level: 'info',
        code: 'history-preserved-same-catalog',
        message: 'Si es el mismo catálogo movido/renombrado, instalaciones e historial deberían conservarse.',
      },
    )
  }

  const response: CatalogPathValidateResponse = {
    resolvedPath,
    isValid,
    isSamePath,
    isEnvLocked,
    riskLevel: isEnvLocked || !isValid ? 'blocked' : isSamePath ? 'none' : 'medium',
    messages,
  }

  return c.json(response)
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
