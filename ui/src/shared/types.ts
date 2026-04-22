import type {
  ApplicationGuide,
  ApplyResult,
  CatalogConfig,
  CustomType,
  HistoryEntry,
  InstallableType,
  InstallationEntry,
  Manifest,
  ProjectEntry,
  Scope,
  TargetScope,
  Tool,
  TrackerFile,
  TrackerOp,
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

export interface GentleAiMasterScan {
  masterPath: string
  masterExists: boolean
  tags: string[]
}

export interface GentleAiDetection {
  installed: boolean
  tags: string[]
  claude: GentleAiMasterScan
  opencode: GentleAiMasterScan
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

export interface InstallationsResponse {
  installations: InstallationEntry[]
}

export type PlanOperationKind = 'install' | 'upgrade' | 'uninstall'

export type PhysicalOp =
  | { kind: 'copy'; from: string; to: string }
  | { kind: 'delete'; path: string }

export interface PlanOperation {
  kind: PlanOperationKind
  customId: string
  customType: InstallableType
  fromVersion?: string
  toVersion?: string
  target: TargetScope
  tools: Tool[]
  physical: PhysicalOp[]
}

export interface PlanWarning {
  code: string
  message: string
  customId?: string
}

export interface PlanBlocker {
  code: string
  message: string
  customId?: string
}

export interface PlanPatchEntry {
  patchId: string
  version: string
  order: number
}

export interface PlanPatchOp {
  target: 'CLAUDE.md' | 'AGENTS.md'
  masterPath: string
  currentHash: string | null
  entries: PlanPatchEntry[]
  willRestoreOriginal: boolean
}

export interface Plan {
  operations: PlanOperation[]
  patchOperations: PlanPatchOp[]
  warnings: PlanWarning[]
  blockers: PlanBlocker[]
  backupWillBeCreated: boolean
  currentInstalledCount: number
}

export interface ApplyResponse {
  applyId: string
  result: ApplyResult
  backupPath: string | null
  error: string | null
  durationMs: number
  installCount: number
  upgradeCount: number
  uninstallCount: number
  patchCount: number
}

export interface TrackerResponse {
  tracker: TrackerFile
}

export interface HistoryResponse {
  entries: HistoryEntry[]
}

export type { HistoryEntry, TrackerOp }
