import type {
  InstallableType,
  InstallationEntry,
  Manifest,
  ProjectEntry,
  TargetScope,
  Tool,
  TrackerFile,
  TrackerOp,
} from '../../shared/schemas'
import type { PhysicalOp, Plan, PlanBlocker, PlanOperation, PlanWarning } from '../../shared/types'
import type { LoadedCatalog } from '../catalog/loader'
import { resolveInstallPath } from './paths'

interface PlannerInput {
  catalogPath: string
  catalog: LoadedCatalog
  installations: InstallationEntry[]
  tracker: TrackerFile
  projects: ProjectEntry[]
}

function manifestById(
  catalog: LoadedCatalog,
  customType: InstallableType,
  customId: string,
): Manifest | null {
  const summary = catalog.customs.find((c) => c.type === customType && c.id === customId)
  if (!summary) return null
  // Re-load not needed here — the summary doesn't carry the manifest.
  // Planner needs the manifest for activeVersion. Loader issues guarantee
  // that the summary has activeVersion if valid.
  // We reconstruct a minimal manifest-ish record using summary data.
  return null // planner falls back to summary data
}

function summaryFor(
  catalog: LoadedCatalog,
  customType: InstallableType,
  customId: string,
) {
  return catalog.customs.find((c) => c.type === customType && c.id === customId)
}

function sameTarget(a: TargetScope, b: TargetScope): boolean {
  if (a.scope !== b.scope) return false
  if (a.scope === 'global') return true
  return a.projectId === (b as { projectId: string }).projectId
}

function trackerOpsFor(
  tracker: TrackerFile,
  customType: InstallableType,
  customId: string,
): TrackerOp[] {
  return tracker.operations.filter((o) => o.customType === customType && o.customId === customId)
}

function buildInstallPhysicals(params: {
  catalogPath: string
  customId: string
  customType: InstallableType
  version: string
  tools: Tool[]
  target: TargetScope
  projects: ProjectEntry[]
}): { physical: PhysicalOp[]; errors: string[] } {
  const errors: string[] = []
  const physical: PhysicalOp[] = []
  for (const tool of params.tools) {
    const res = resolveInstallPath({
      catalogPath: params.catalogPath,
      customId: params.customId,
      customType: params.customType,
      version: params.version,
      tool,
      target: params.target,
      projects: params.projects,
    })
    if ('error' in res) {
      errors.push(res.error)
      continue
    }
    physical.push({ kind: 'copy', from: res.sourceFile, to: res.destFile })
  }
  return { physical, errors }
}

function buildUninstallPhysicals(ops: TrackerOp[]): PhysicalOp[] {
  // For copy ops, the reverse is to delete the destination path.
  return ops
    .filter((o) => o.type === 'copy')
    .map((o) => ({ kind: 'delete', path: o.toPath }))
}

function desiredInstallsFor(installations: InstallationEntry[]) {
  const map = new Map<string, InstallationEntry>()
  for (const e of installations) {
    map.set(`${e.customType}:${e.customId}`, e)
  }
  return map
}

function trackerInstallsFor(tracker: TrackerFile) {
  const map = new Map<
    string,
    { customType: InstallableType; customId: string; version: string; target: TargetScope; tools: Tool[] }
  >()
  for (const op of tracker.operations) {
    const key = `${op.customType}:${op.customId}`
    const existing = map.get(key)
    if (existing) {
      if (!existing.tools.includes(op.tool)) existing.tools.push(op.tool)
    } else {
      map.set(key, {
        customType: op.customType,
        customId: op.customId,
        version: op.version,
        target: op.target,
        tools: [op.tool],
      })
    }
  }
  return map
}

export function computePlan(input: PlannerInput): Plan {
  const { catalogPath, catalog, installations, tracker, projects } = input
  const operations: PlanOperation[] = []
  const warnings: PlanWarning[] = []
  const blockers: PlanBlocker[] = []

  const desired = desiredInstallsFor(installations)
  const installed = trackerInstallsFor(tracker)

  // Installs + upgrades + retarget
  for (const [key, entry] of desired) {
    const summary = summaryFor(catalog, entry.customType, entry.customId)
    if (!summary) {
      blockers.push({
        code: 'custom-missing',
        message: `desired install refers to a custom not in catalog: ${key}`,
        customId: entry.customId,
      })
      continue
    }
    if (!summary.valid) {
      blockers.push({
        code: 'custom-invalid',
        message: `custom has validation errors: ${key}`,
        customId: entry.customId,
      })
      continue
    }

    const requestedTools = entry.tools.filter((t) => summary.tools.includes(t))
    if (requestedTools.length === 0) {
      blockers.push({
        code: 'no-tools-supported',
        message: `custom ${key} does not support any of the selected tools`,
        customId: entry.customId,
      })
      continue
    }

    const prev = installed.get(key)
    const needsInstall = !prev
    const needsUpgrade =
      prev !== undefined &&
      (prev.version !== summary.activeVersion ||
        !sameTarget(prev.target, entry.target) ||
        prev.tools.length !== requestedTools.length ||
        !prev.tools.every((t) => requestedTools.includes(t)))

    if (!needsInstall && !needsUpgrade) continue

    const { physical, errors } = buildInstallPhysicals({
      catalogPath,
      customId: entry.customId,
      customType: entry.customType,
      version: summary.activeVersion,
      tools: requestedTools,
      target: entry.target,
      projects,
    })
    for (const err of errors) {
      blockers.push({ code: 'path-resolution', message: err, customId: entry.customId })
    }

    if (needsInstall) {
      operations.push({
        kind: 'install',
        customId: entry.customId,
        customType: entry.customType,
        toVersion: summary.activeVersion,
        target: entry.target,
        tools: requestedTools,
        physical,
      })
    } else if (needsUpgrade && prev) {
      const uninstallOps = buildUninstallPhysicals(
        trackerOpsFor(tracker, entry.customType, entry.customId),
      )
      operations.push({
        kind: 'upgrade',
        customId: entry.customId,
        customType: entry.customType,
        fromVersion: prev.version,
        toVersion: summary.activeVersion,
        target: entry.target,
        tools: requestedTools,
        physical: [...uninstallOps, ...physical],
      })
    }

    // Dep check (non-blocking, informative warning for now)
    if (summary.tools && summary.hasHook) {
      // placeholder for future hook-registry sync warnings
    }
  }

  // Uninstalls
  for (const [key, info] of installed) {
    if (desired.has(key)) continue
    const ops = trackerOpsFor(tracker, info.customType, info.customId)
    operations.push({
      kind: 'uninstall',
      customId: info.customId,
      customType: info.customType,
      fromVersion: info.version,
      target: info.target,
      tools: info.tools,
      physical: buildUninstallPhysicals(ops),
    })
  }

  // Path collision detection across planned installs
  const claimed = new Map<string, string>() // dest path → key
  for (const op of operations) {
    if (op.kind === 'uninstall') continue
    for (const phys of op.physical) {
      if (phys.kind !== 'copy') continue
      const existing = claimed.get(phys.to)
      const thisKey = `${op.customType}:${op.customId}`
      if (existing && existing !== thisKey) {
        blockers.push({
          code: 'path-collision',
          message: `${existing} and ${thisKey} both target ${phys.to}`,
        })
      } else {
        claimed.set(phys.to, thisKey)
      }
    }
  }

  return {
    operations,
    warnings,
    blockers,
    backupWillBeCreated: operations.length > 0,
    currentInstalledCount: installed.size,
  }
}

// Exported to silence unused import warning if any
export { manifestById as _manifestById }
