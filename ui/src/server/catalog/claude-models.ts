import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ClaudeModelRegistrySchema, type ClaudeModelRegistry } from '../../shared/schemas'

// The Claude model registry is a STATIC, CATALOG-SIDE file maintained by
// the user (or the template maintainer). We do NOT auto-update it. Claude
// model identifiers are known and predefined — when Anthropic releases a
// new version, the user edits this file.
//
// Shipped location inside the template:
//   <catalogPath>/.ai-customizer/models/claude.json
//
// Default (used when the file is missing or malformed): three aliases
// pointing at current known-latest full IDs, plus a small history of
// known versions.

const DEFAULT_REGISTRY: ClaudeModelRegistry = {
  schemaVersion: '1.0',
  aliases: {
    haiku: { latest: 'claude-haiku-4-5' },
    sonnet: { latest: 'claude-sonnet-4-6' },
    opus: { latest: 'claude-opus-4-7' },
  },
  knownVersions: [
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
  ],
}

export function claudeModelsPath(catalogPath: string): string {
  return path.join(catalogPath, '.ai-customizer', 'models', 'claude.json')
}

export interface ClaudeModelsResponse {
  registry: ClaudeModelRegistry
  filePath: string
  fileFound: boolean
  usingDefault: boolean
  parseError: string | null
}

export async function readClaudeModels(catalogPath: string): Promise<ClaudeModelsResponse> {
  const filePath = claudeModelsPath(catalogPath)
  if (!existsSync(filePath)) {
    return {
      registry: DEFAULT_REGISTRY,
      filePath,
      fileFound: false,
      usingDefault: true,
      parseError: null,
    }
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = ClaudeModelRegistrySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      return {
        registry: DEFAULT_REGISTRY,
        filePath,
        fileFound: true,
        usingDefault: true,
        parseError: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      }
    }
    return {
      registry: parsed.data,
      filePath,
      fileFound: true,
      usingDefault: false,
      parseError: null,
    }
  } catch (err) {
    return {
      registry: DEFAULT_REGISTRY,
      filePath,
      fileFound: true,
      usingDefault: true,
      parseError: err instanceof Error ? err.message : String(err),
    }
  }
}
