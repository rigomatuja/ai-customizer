import { Hono } from 'hono'
import type { EffectiveToolState, ToolDetection } from '../../shared/types'
import { readClaudeModels } from '../catalog/claude-models'
import { getCatalogPath } from '../catalog/paths'
import { readUserConfig } from '../state/config'
import {
  readOpencodeModelsRegistry,
  writeOpencodeModelsRegistry,
} from '../state/opencode-models-registry'
import { detectAllTools } from '../tools/detection'
import { detectGentleAi } from '../tools/gentle-ai'
import { detectOpencodeModels } from '../tools/opencode-models'

export const toolsRoutes = new Hono()

function effectiveEnabled(detection: ToolDetection, override: boolean | undefined): {
  overridden: boolean
  enabled: boolean
} {
  if (typeof override === 'boolean') {
    return { overridden: true, enabled: override }
  }
  return { overridden: false, enabled: detection.status !== 'missing' }
}

toolsRoutes.get('/', async (c) => {
  const [detection, cfg] = await Promise.all([detectAllTools(), readUserConfig()])
  const ov = cfg?.toolsOverride
  const effective: EffectiveToolState = {
    claude: {
      detected: detection.claude.status,
      ...effectiveEnabled(detection.claude, ov?.claude),
    },
    opencode: {
      detected: detection.opencode.status,
      ...effectiveEnabled(detection.opencode, ov?.opencode),
    },
  }
  return c.json({ detection, effective })
})

toolsRoutes.get('/gentle-ai', async (c) => {
  const result = await detectGentleAi()
  return c.json(result)
})

// -----------------------------------------------------------------------
// Claude model registry — static, catalog-side, read-only via API.
// -----------------------------------------------------------------------

toolsRoutes.get('/claude-models', async (c) => {
  const catalogPath = getCatalogPath()
  const result = await readClaudeModels(catalogPath)
  return c.json(result)
})

// -----------------------------------------------------------------------
// Opencode model registry — detected from the user's Opencode install.
// GET returns the last cached detection from state; POST /refresh
// re-runs detection and persists.
// -----------------------------------------------------------------------

toolsRoutes.get('/opencode-models', async (c) => {
  const registry = await readOpencodeModelsRegistry()
  return c.json({ registry })
})

toolsRoutes.post('/opencode-models/refresh', async (c) => {
  const detection = await detectOpencodeModels()
  const registry = await writeOpencodeModelsRegistry(detection.models)
  return c.json({
    registry,
    sourcePaths: {
      cachePath: detection.cachePath,
      cacheFound: detection.cacheFound,
      authPath: detection.authPath,
      authFound: detection.authFound,
    },
    availableProviders: detection.availableProviders,
  })
})
