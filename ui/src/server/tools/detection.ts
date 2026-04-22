import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Tool } from '../../shared/schemas'
import type { ToolDetection, ToolStatus, ToolsDetectionResponse } from '../../shared/types'

function whichBinary(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [name], { timeout: 3_000 }, (err, stdout) => {
      if (err) return resolve(null)
      const out = stdout.trim()
      resolve(out.length > 0 ? out : null)
    })
  })
}

function configDirFor(tool: Tool): string {
  const home = os.homedir()
  return tool === 'claude'
    ? path.join(home, '.claude')
    : path.join(home, '.config', 'opencode')
}

function binaryName(tool: Tool): string {
  return tool === 'claude' ? 'claude' : 'opencode'
}

function computeStatus(binary: string | null, configExists: boolean): ToolStatus {
  if (binary && configExists) return 'ok'
  if (binary || configExists) return 'partial'
  return 'missing'
}

export async function detectTool(tool: Tool): Promise<ToolDetection> {
  const [binary, configDir] = [await whichBinary(binaryName(tool)), configDirFor(tool)]
  const configExists = existsSync(configDir)
  return {
    tool,
    binaryPath: binary,
    configDir,
    configExists,
    status: computeStatus(binary, configExists),
  }
}

export async function detectAllTools(): Promise<ToolsDetectionResponse> {
  const [claude, opencode] = await Promise.all([detectTool('claude'), detectTool('opencode')])
  return { claude, opencode }
}
