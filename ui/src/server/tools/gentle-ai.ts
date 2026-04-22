import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { GentleAiDetection, GentleAiMasterScan } from '../../shared/types'

// Matches <!-- gentle-ai:<tag> --> with optional inner whitespace.
// Tag characters: alphanumeric, underscore, hyphen. Case-sensitive — the
// convention is lowercase (see docs/llm.md).
const TAG_REGEX = /<!--\s*gentle-ai:([a-zA-Z0-9_-]+)\s*-->/g

async function scanMaster(filePath: string): Promise<GentleAiMasterScan> {
  if (!existsSync(filePath)) {
    return { masterPath: filePath, masterExists: false, tags: [] }
  }
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const seen = new Set<string>()
    for (const m of content.matchAll(TAG_REGEX)) {
      if (m[1]) seen.add(m[1])
    }
    return {
      masterPath: filePath,
      masterExists: true,
      tags: [...seen].sort(),
    }
  } catch {
    return { masterPath: filePath, masterExists: false, tags: [] }
  }
}

export async function detectGentleAi(): Promise<GentleAiDetection> {
  const home = os.homedir()
  const claudeMaster = path.join(home, '.claude', 'CLAUDE.md')
  const opencodeMaster = path.join(home, '.config', 'opencode', 'AGENTS.md')

  const [claude, opencode] = await Promise.all([
    scanMaster(claudeMaster),
    scanMaster(opencodeMaster),
  ])

  const union = new Set<string>([...claude.tags, ...opencode.tags])
  return {
    installed: union.size > 0,
    tags: [...union].sort(),
    claude,
    opencode,
  }
}
