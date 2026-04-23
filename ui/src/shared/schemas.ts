import { z } from 'zod'

export const SemverString = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be semver (X.Y.Z)')

export const VersionFolderName = z
  .string()
  .regex(/^v\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be vX.Y.Z folder name')

export const CustomIdRegex = /^[a-z0-9][a-z0-9-_]*$/
export const CustomId = z.string().regex(CustomIdRegex, 'lowercase alphanumeric + - _, starting with alphanumeric')

export const CustomType = z.enum(['skill', 'agent', 'patch'])
export type CustomType = z.infer<typeof CustomType>

export const Tool = z.enum(['claude', 'opencode'])
export type Tool = z.infer<typeof Tool>

export const Scope = z.enum(['global', 'project'])
export type Scope = z.infer<typeof Scope>

export const ProjectMetadataSchema = z.object({
  name: z.string().min(1),
  repoUrl: z.string().url().optional(),
  description: z.string().optional(),
})
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>

export const VersionEntrySchema = z.object({
  version: SemverString,
  createdAt: z.string().datetime().or(z.string().min(1)),
  changelog: z.string(),
})
export type VersionEntry = z.infer<typeof VersionEntrySchema>

export const DependenciesSchema = z
  .object({
    gentleAi: z
      .object({
        required: z.boolean(),
        minVersion: SemverString.nullable().optional(),
      })
      .optional(),
    customs: z
      .array(z.string().regex(/^(skill|agent|patch):[a-z0-9-_]+$/, 'format: "{type}:{id}"'))
      .optional(),
  })
  .optional()
export type Dependencies = z.infer<typeof DependenciesSchema>

export const HookTriggerTypeEnum = z.enum(['phase', 'agent-event', 'procedure'])
export const HookTriggerSchema = z.object({
  type: HookTriggerTypeEnum,
  target: z.string().min(1),
})
export const HookSchema = z.object({
  triggers: z.array(HookTriggerSchema).min(1),
  onFail: z.enum(['halt', 'warn', 'continue']).optional(),
})
export type HookTrigger = z.infer<typeof HookTriggerSchema>
export type Hook = z.infer<typeof HookSchema>

const BaseManifestShape = {
  id: CustomId,
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  scope: Scope,
  project: ProjectMetadataSchema.nullable().optional(),
  versions: z.array(VersionEntrySchema).min(1),
  activeVersion: SemverString,
  dependencies: DependenciesSchema,
}

export const SkillManifestSchema = z.object({
  ...BaseManifestShape,
  type: z.literal('skill'),
  hook: HookSchema.optional(),
})
export type SkillManifest = z.infer<typeof SkillManifestSchema>

export const AgentManifestSchema = z.object({
  ...BaseManifestShape,
  type: z.literal('agent'),
  hook: HookSchema.optional(),
})
export type AgentManifest = z.infer<typeof AgentManifestSchema>

export const PatchTarget = z.enum(['CLAUDE.md', 'AGENTS.md', 'both'])
export type PatchTarget = z.infer<typeof PatchTarget>

export const PatchManifestSchema = z.object({
  ...BaseManifestShape,
  type: z.literal('patch'),
  target: PatchTarget,
})
export type PatchManifest = z.infer<typeof PatchManifestSchema>

export const ManifestSchema = z.discriminatedUnion('type', [
  SkillManifestSchema,
  AgentManifestSchema,
  PatchManifestSchema,
])
export type Manifest = z.infer<typeof ManifestSchema>

export const CatalogConfigSchema = z.object({
  schemaVersion: z.string().min(1),
  name: z.string(),
  createdAt: z.string().min(1),
})
export type CatalogConfig = z.infer<typeof CatalogConfigSchema>

export const TriggersFileSchema = z.object({
  schemaVersion: z.string().min(1),
  triggers: z.array(z.string()),
})
export type TriggersFile = z.infer<typeof TriggersFileSchema>

export const GuideEntrySchema = z.object({
  patchId: CustomId,
  version: SemverString,
  active: z.boolean(),
  order: z.number().int().nonnegative(),
})
export type GuideEntry = z.infer<typeof GuideEntrySchema>

export const ApplicationGuideSchema = z.object({
  schemaVersion: z.string().min(1),
  targets: z.object({
    'CLAUDE.md': z.array(GuideEntrySchema),
    'AGENTS.md': z.array(GuideEntrySchema),
  }),
})
export type ApplicationGuide = z.infer<typeof ApplicationGuideSchema>

export const ToolsOverrideSchema = z.object({
  claude: z.boolean().optional(),
  opencode: z.boolean().optional(),
})
export type ToolsOverride = z.infer<typeof ToolsOverrideSchema>

export const UserConfigSchema = z.object({
  schemaVersion: z.literal('1.0'),
  catalogPath: z.string().min(1),
  toolsOverride: ToolsOverrideSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})
export type UserConfig = z.infer<typeof UserConfigSchema>

export const ProjectEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  repoUrl: z.string().url().optional(),
})
export type ProjectEntry = z.infer<typeof ProjectEntrySchema>

export const ProjectsFileSchema = z.object({
  schemaVersion: z.literal('1.0'),
  projects: z.array(ProjectEntrySchema),
})
export type ProjectsFile = z.infer<typeof ProjectsFileSchema>

export const ProjectCreateInputSchema = ProjectEntrySchema.omit({ id: true })
export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>

export const ProjectUpdateInputSchema = ProjectCreateInputSchema.partial()
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInputSchema>

export const TargetScopeSchema = z.union([
  z.object({ scope: z.literal('global') }),
  z.object({ scope: z.literal('project'), projectId: z.string().min(1) }),
])
export type TargetScope = z.infer<typeof TargetScopeSchema>

export const InstallableType = z.enum(['skill', 'agent'])
export type InstallableType = z.infer<typeof InstallableType>

export const InstallationEntrySchema = z.object({
  customId: CustomId,
  customType: InstallableType,
  target: TargetScopeSchema,
  tools: z.array(Tool).min(1),
})
export type InstallationEntry = z.infer<typeof InstallationEntrySchema>

export const InstallationsFileSchema = z.object({
  schemaVersion: z.literal('1.0'),
  installations: z.array(InstallationEntrySchema),
})
export type InstallationsFile = z.infer<typeof InstallationsFileSchema>

export const TrackerOpTypeSchema = z.enum(['copy', 'json-merge'])
export type TrackerOpType = z.infer<typeof TrackerOpTypeSchema>

export const TrackerOpSchema = z.object({
  opId: z.string().min(1),
  type: TrackerOpTypeSchema,
  customId: CustomId,
  customType: InstallableType,
  version: SemverString,
  tool: Tool,
  target: TargetScopeSchema,
  toPath: z.string().min(1),
  fromPath: z.string().optional(),
  jsonPath: z.string().optional(),
  contentHash: z.string().optional(),
  installedAt: z.string().min(1),
})
export type TrackerOp = z.infer<typeof TrackerOpSchema>

export const PatchMasterName = z.enum(['CLAUDE.md', 'AGENTS.md'])
export type PatchMasterName = z.infer<typeof PatchMasterName>

export const PatchTrackerOpSchema = z.object({
  opId: z.string().min(1),
  target: PatchMasterName,
  masterPath: z.string().min(1),
  originalBackup: z.string().min(1),
  activeGuideHash: z.string().min(1),
  appliedContentHash: z.string().min(1),
  installedAt: z.string().min(1),
})
export type PatchTrackerOp = z.infer<typeof PatchTrackerOpSchema>

export const ApplyResultSchema = z.enum(['success', 'rolled-back', 'rollback-failed'])
export type ApplyResult = z.infer<typeof ApplyResultSchema>

export const TrackerFileSchema = z.object({
  schemaVersion: z.literal('1.0'),
  catalogPath: z.string().min(1),
  lastApply: z.string().nullable(),
  lastApplyResult: ApplyResultSchema.nullable().optional(),
  operations: z.array(TrackerOpSchema),
  patches: z.array(PatchTrackerOpSchema),
})
export type TrackerFile = z.infer<typeof TrackerFileSchema>

export const HistoryEntrySchema = z.object({
  applyId: z.string().min(1),
  timestamp: z.string().min(1),
  result: ApplyResultSchema,
  installCount: z.number().int().nonnegative(),
  upgradeCount: z.number().int().nonnegative(),
  uninstallCount: z.number().int().nonnegative(),
  patchCount: z.number().int().nonnegative().optional(),
  backupPath: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().nonnegative(),
})
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>

export const HistoryFileSchema = z.object({
  schemaVersion: z.literal('1.0'),
  entries: z.array(HistoryEntrySchema),
})
export type HistoryFile = z.infer<typeof HistoryFileSchema>

// -----------------------------------------------------------------------
// Model registries
// -----------------------------------------------------------------------
// Two independent registries — one per tool, because the two tools
// expose models in fundamentally different ways.
//
//  • Claude  — static catalog-side list, user-editable, stable. Aliases
//              (`opus`/`sonnet`/`haiku`) resolve to "latest version" via
//              Claude Code itself. We ship specific full-ID versions
//              alongside so the manager can offer explicit pinning.
//  • Opencode — detected from the user's Opencode install (the cache
//               file that `opencode models` populates + auth + env).
//               Lives in the state dir because it's per-machine.

export const ClaudeModelAlias = z.enum(['haiku', 'sonnet', 'opus'])
export type ClaudeModelAlias = z.infer<typeof ClaudeModelAlias>

export const ClaudeModelAliasEntrySchema = z.object({
  latest: z.string().min(1), // full ID like "claude-opus-4-7"
})

export const ClaudeModelRegistrySchema = z.object({
  schemaVersion: z.literal('1.0'),
  aliases: z.object({
    haiku: ClaudeModelAliasEntrySchema,
    sonnet: ClaudeModelAliasEntrySchema,
    opus: ClaudeModelAliasEntrySchema,
  }),
  knownVersions: z.array(z.string().min(1)),
})
export type ClaudeModelRegistry = z.infer<typeof ClaudeModelRegistrySchema>

export const OpencodeModelEntrySchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().optional(),
  modelId: z.string().min(1),
  modelName: z.string().optional(),
  family: z.string().optional(),
  toolCall: z.boolean(),
  reasoning: z.boolean().optional(),
})
export type OpencodeModelEntry = z.infer<typeof OpencodeModelEntrySchema>

export const OpencodeModelRegistrySchema = z.object({
  schemaVersion: z.literal('1.0'),
  detectedAt: z.string().nullable(),
  models: z.array(OpencodeModelEntrySchema),
})
export type OpencodeModelRegistry = z.infer<typeof OpencodeModelRegistrySchema>
