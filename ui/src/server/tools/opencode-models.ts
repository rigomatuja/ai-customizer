import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { OpencodeModelEntry } from '../../shared/schemas'

// ---------------------------------------------------------------------------
// Opencode model detection — replicates the approach used by gentle-ai.
// ---------------------------------------------------------------------------
//
// Sources we read (NEVER write) from the user's Opencode install:
//   ~/.cache/opencode/models.json        — populated by `opencode models`
//   ~/.local/share/opencode/auth.json    — OAuth'd provider credentials
//   env vars like ANTHROPIC_API_KEY      — detected via process.env
//
// Output = the flat list of provider/model pairs the user can actually use:
// provider is authenticated (auth, "opencode" built-in, or env vars ok) AND
// the model supports tool calls.
// ---------------------------------------------------------------------------

interface RawModel {
  id?: string
  name?: string
  family?: string
  tool_call?: boolean
  reasoning?: boolean
}

interface RawProvider {
  id?: string
  name?: string
  env?: string[]
  models?: Record<string, RawModel>
}

const CACHE_PATH = path.join(os.homedir(), '.cache', 'opencode', 'models.json')
const AUTH_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json')

export interface OpencodeDetectionResult {
  cachePath: string
  cacheFound: boolean
  authPath: string
  authFound: boolean
  availableProviders: string[]
  models: OpencodeModelEntry[]
}

async function readJson<T = unknown>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function allEnvVarsSet(envVars: string[] | undefined): boolean {
  if (!envVars || envVars.length === 0) return false
  return envVars.every((v) => (process.env[v] ?? '').length > 0)
}

function hasToolCallModel(provider: RawProvider): boolean {
  if (!provider.models) return false
  return Object.values(provider.models).some((m) => m?.tool_call === true)
}

export async function detectOpencodeModels(): Promise<OpencodeDetectionResult> {
  const cacheFound = existsSync(CACHE_PATH)
  const authFound = existsSync(AUTH_PATH)

  const providers = (await readJson<Record<string, RawProvider>>(CACHE_PATH)) ?? {}
  const authProviders = (await readJson<Record<string, unknown>>(AUTH_PATH)) ?? {}

  const availableProviders: string[] = []
  const models: OpencodeModelEntry[] = []

  for (const [providerId, rawProvider] of Object.entries(providers)) {
    if (!rawProvider || !hasToolCallModel(rawProvider)) continue

    // Availability: authenticated OR the built-in "opencode" subscription
    // OR all required env vars are set.
    const authenticated =
      authProviders[providerId] !== undefined ||
      providerId === 'opencode' ||
      allEnvVarsSet(rawProvider.env)

    if (!authenticated) continue

    availableProviders.push(providerId)

    for (const [modelId, rawModel] of Object.entries(rawProvider.models ?? {})) {
      if (!rawModel?.tool_call) continue
      models.push({
        providerId,
        providerName: rawProvider.name,
        modelId,
        modelName: rawModel.name,
        family: rawModel.family,
        toolCall: true,
        reasoning: rawModel.reasoning === true ? true : undefined,
      })
    }
  }

  availableProviders.sort()
  models.sort((a, b) => {
    if (a.providerId !== b.providerId) return a.providerId.localeCompare(b.providerId)
    return (a.modelName ?? a.modelId).localeCompare(b.modelName ?? b.modelId)
  })

  return {
    cachePath: CACHE_PATH,
    cacheFound,
    authPath: AUTH_PATH,
    authFound,
    availableProviders,
    models,
  }
}
