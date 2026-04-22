import { Hono } from 'hono'
import type { EffectiveToolState, ToolDetection } from '../../shared/types'
import { readUserConfig } from '../state/config'
import { detectAllTools } from '../tools/detection'

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
