import type {
  ApplicationGuide,
  CatalogConfig,
  CustomType,
  Manifest,
  ProjectEntry,
  Scope,
  Tool,
  UserConfig,
} from './schemas'

export type IssueLevel = 'error' | 'warning'

export interface ValidationIssue {
  level: IssueLevel
  code: string
  message: string
  path?: string
}

export interface CatalogOverview {
  schemaVersion: string
  name: string
  catalogPath: string
  counts: {
    skills: number
    agents: number
    patches: number
    hooks: number
    invalid: number
  }
  triggers: string[]
  guide: ApplicationGuide
  config: CatalogConfig
  issues: ValidationIssue[]
}

export interface CustomSummary {
  id: string
  name: string
  description: string
  type: CustomType
  category: string
  scope: Scope
  project: Manifest['project'] | null
  tools: Tool[]
  activeVersion: string
  versionCount: number
  hasHook: boolean
  isPatch: boolean
  patchTarget?: 'CLAUDE.md' | 'AGENTS.md' | 'both'
  valid: boolean
  issues: ValidationIssue[]
}

export interface VersionInfo {
  version: string
  createdAt: string
  changelog: string
  files: Array<{ tool: Tool; relativePath: string }>
}

export interface CustomDetail {
  id: string
  type: CustomType
  manifest: Manifest | null
  versions: VersionInfo[]
  valid: boolean
  issues: ValidationIssue[]
}

export interface CustomsListResponse {
  customs: CustomSummary[]
}

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}

export type ToolStatus = 'ok' | 'partial' | 'missing'

export interface ToolDetection {
  tool: Tool
  binaryPath: string | null
  configDir: string
  configExists: boolean
  status: ToolStatus
}

export interface ToolsDetectionResponse {
  claude: ToolDetection
  opencode: ToolDetection
}

export interface EffectiveToolState {
  claude: { detected: ToolStatus; overridden: boolean; enabled: boolean }
  opencode: { detected: ToolStatus; overridden: boolean; enabled: boolean }
}

export interface AppStateResponse {
  initialized: boolean
  config: UserConfig | null
  catalogPath: string
  userConfigDir: string
}

export interface ProjectsResponse {
  projects: ProjectEntry[]
}
