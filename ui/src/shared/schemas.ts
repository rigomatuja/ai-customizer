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
  description: z.string(),
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
