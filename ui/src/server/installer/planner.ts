import type {
  ApplicationGuide,
  InstallableType,
  InstallationEntry,
  Manifest,
  PatchMasterName,
  ProjectEntry,
  TargetScope,
  Tool,
  TrackerFile,
  TrackerOp,
  TriggersFile,
} from '../../shared/schemas'
import type {
  PhysicalOp,
  Plan,
  PlanBlocker,
  PlanOperation,
  PlanPatchOp,
  PlanWarning,
} from '../../shared/types'
import { isKnownTrigger } from '../catalog/triggers'
import type { LoadedCatalog } from '../catalog/loader'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { hashFileIfExists } from './fs-utils'
import { resolveInstallPath } from './paths'
import {
  activeEntriesFor,
  activeGuideHashFor,
  composePatches,
  globalMasterPath,
  originalBackupPath,
} from './patches'

interface PlannerInput {
  catalogPath: string
  catalog: LoadedCatalog
  installations: InstallationEntry[]
  tracker: TrackerFile
  projects: ProjectEntry[]
  guide: ApplicationGuide
  triggersFile: TriggersFile
  manifests: Map<string, Manifest>
}

function summaryFor(
  catalog: LoadedCatalog,
  customType: InstallableType,
  customId: string,
) {
  return catalog.customs.find((c) => c.type === customType && c.id === customId)
}

/**
 * Resolve the transitive dependency closure of a custom. Detects:
 * - missing refs (dep id not in catalog)
 * - inactive deps (dep not in desired set)
 * - cycles (A → B → A)
 *
 * Only skills/agents have `dependencies.customs`; patches don't.
 */
function resolveDepClosure(
  rootId: string,
  rootType: InstallableType,
  manifests: Map<string, Manifest>,
  catalog: LoadedCatalog,
  desired: Map<string, InstallationEntry>,
): Array<{ code: string; message: string }> {
  const errors: Array<{ code: string; message: string }> = []
  const visited = new Set<string>()
  const stack: Array<{ id: string; type: InstallableType; path: string[] }> = [
    { id: rootId, type: rootType, path: [`${rootType}:${rootId}`] },
  ]

  while (stack.length > 0) {
    const node = stack.pop()!
    const nodeKey = `${node.type}:${node.id}`
    if (visited.has(nodeKey)) continue
    visited.add(nodeKey)

    const manifest = manifests.get(nodeKey)
    if (!manifest || manifest.type === 'patch') continue

    const declared = manifest.dependencies?.customs ?? []
    for (const dep of declared) {
      const [depTypeRaw, depIdRaw] = dep.split(':')
      if (!depTypeRaw || !depIdRaw) continue
      const depType = depTypeRaw as InstallableType

      // Existence in catalog.
      const depInCatalog = catalog.customs.some((c) => c.type === depType && c.id === depIdRaw)
      if (!depInCatalog) {
        errors.push({
          code: 'dependency-missing-in-catalog',
          message: `transitive dependency ${dep} (via ${node.path.join(' → ')}) does not exist in the catalog`,
        })
        continue
      }

      // Active in desired set.
      if (!desired.has(dep)) {
        errors.push({
          code: 'dependency-not-active',
          message: `${node.path.length === 1 ? 'requires' : `transitively requires (via ${node.path.join(' → ')})`} ${dep} to be active`,
        })
      }

      // Cycle detection.
      const depKey = `${depType}:${depIdRaw}`
      if (node.path.includes(depKey)) {
        errors.push({
          code: 'dependency-cycle',
          message: `dependency cycle detected: ${[...node.path, depKey].join(' → ')}`,
        })
        continue
      }

      stack.push({ id: depIdRaw, type: depType, path: [...node.path, depKey] })
    }
  }

  return errors
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
    // Exclude the manager: it's tracked but lives outside of the
    // installations.json desired-state model (managed by a dedicated
    // /api/manager install flow).
    if (op.customType === 'agent' && op.customId === 'manager') continue
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

export async function computePlan(input: PlannerInput): Promise<Plan> {
  const { catalogPath, catalog, installations, tracker, projects, guide, triggersFile, manifests } = input
  const operations: PlanOperation[] = []
  const patchOperations: PlanPatchOp[] = []
  const warnings: PlanWarning[] = []
  const blockers: PlanBlocker[] = []

  // Unknown-trigger warnings for hooks among active installations.
  for (const inst of installations) {
    const manifest = manifests.get(`${inst.customType}:${inst.customId}`)
    if (!manifest) continue
    if (manifest.type === 'patch') continue
    if (!manifest.hook) continue
    for (const trigger of manifest.hook.triggers) {
      const target = `${trigger.type}:${trigger.target}`
      if (!isKnownTrigger(triggersFile, target)) {
        warnings.push({
          code: 'unknown-trigger',
          message: `${inst.customType}:${inst.customId} declares unknown trigger "${target}". Not in the catalog vocabulary.`,
          customId: inst.customId,
        })
      }
    }
  }

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

    if (!needsInstall && !needsUpgrade) {
      // Desired state matches tracker, but filesystem may have drifted.
      // Compare each tracked file's current content hash against what
      // we recorded at install time. Emit non-blocking warnings.
      const ops = trackerOpsFor(tracker, entry.customType, entry.customId)
      for (const op of ops) {
        if (op.type !== 'copy' || !op.contentHash) continue
        const currentHash = await hashFileIfExists(op.toPath)
        if (currentHash === null) {
          warnings.push({
            code: 'drift-missing',
            message: `${key} (${op.tool}) is tracked as installed but the file is missing at ${op.toPath}. Re-Apply to restore.`,
            customId: entry.customId,
          })
        } else if (currentHash !== op.contentHash) {
          warnings.push({
            code: 'drift-modified',
            message: `${key} (${op.tool}) has been modified since install (${op.toPath}). A future Apply will overwrite your changes.`,
            customId: entry.customId,
          })
        }
      }
      continue
    }

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

    // Dependencies.customs: direct + transitive + existence check +
    // cycle detection. All violations are blockers.
    const depErrors = resolveDepClosure(entry.customId, entry.customType, manifests, catalog, desired)
    for (const err of depErrors) {
      blockers.push({
        code: err.code,
        message: `${key}: ${err.message}`,
        customId: entry.customId,
      })
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

  // Patch operations per master
  for (const target of ['CLAUDE.md', 'AGENTS.md'] as PatchMasterName[]) {
    const active = activeEntriesFor(guide, target)
    const wantHash = activeGuideHashFor(active)
    const trackerEntry = tracker.patches.find((p) => p.target === target)
    const currentHash = trackerEntry?.activeGuideHash ?? null

    // Validate referenced patches exist in catalog
    const missingPatchIds: string[] = []
    for (const entry of active) {
      const summary = catalog.customs.find(
        (c) => c.type === 'patch' && c.id === entry.patchId,
      )
      if (!summary) {
        missingPatchIds.push(entry.patchId)
      }
    }
    for (const mid of missingPatchIds) {
      blockers.push({
        code: 'patch-missing',
        message: `application-guide references patch "${mid}" but it is not in the catalog`,
        customId: mid,
      })
    }

    // Skip when both sides already match:
    // - No active entries AND no tracker record → never applied, nothing to do.
    // - Same activeGuideHash as last recorded → already applied.
    if (active.length === 0 && trackerEntry === undefined) continue
    if (wantHash === currentHash) continue

    const willRestoreOriginal = active.length === 0 && trackerEntry !== undefined
    const masterPath = globalMasterPath(target)

    // Dry-run composition: catch before.md mismatches at plan time
    // rather than letting them abort Apply halfway through.
    if (active.length > 0 && missingPatchIds.length === 0) {
      const origPath = originalBackupPath(masterPath)
      const baselinePath = existsSync(origPath)
        ? origPath
        : existsSync(masterPath)
          ? masterPath
          : null
      if (baselinePath) {
        const baseline = await fs.readFile(baselinePath, 'utf8')
        const composed = await composePatches({
          catalogPath,
          baseline,
          target,
          entries: active,
        })
        if ('code' in composed) {
          blockers.push({
            code: 'patch-dry-run-failed',
            message: `patch ${composed.patchId} v${composed.version} would fail at Apply: ${composed.message}`,
            customId: composed.patchId,
          })
        }
      }
    }

    patchOperations.push({
      target,
      masterPath,
      currentHash,
      entries: active.map((e) => ({
        patchId: e.patchId,
        version: e.version,
        order: e.order,
      })),
      willRestoreOriginal,
    })
  }

  return {
    operations,
    patchOperations,
    warnings,
    blockers,
    backupWillBeCreated: operations.length > 0 || patchOperations.length > 0,
    currentInstalledCount: installed.size,
  }
}
