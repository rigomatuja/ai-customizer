import { existsSync } from 'node:fs'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type {
  ApplicationGuide,
  InstallableType,
  PatchTrackerOp,
  ProjectEntry,
  TargetScope,
  Tool,
  TrackerOp,
} from '../../shared/schemas'
import type {
  ApplyResponse,
  PhysicalOp,
  Plan,
  PlanOperation,
  PlanPatchOp,
} from '../../shared/types'
import { log } from '../logging'
import { appendHistory } from '../state/history'
import { readTracker, writeTracker } from '../state/tracker'
import { createBackup, restoreBackup } from './backup'
import { copyFile, deleteFileAndCleanup, hashFile } from './fs-utils'
import { regenerateHookRegistries } from './hook-registry'
import { executePatchApply } from './patches'

interface ExecutionInput {
  plan: Plan
  catalogPath: string
  projectPaths: string[]
  guide: ApplicationGuide
  projects: ProjectEntry[]
}

interface ExecutedPhysical {
  op: PlanOperation
  applied: PhysicalOp
  trackerOp?: TrackerOp
}

function opsAsTrackerEntries(op: PlanOperation, applied: PhysicalOp, tool: Tool): TrackerOp | null {
  if (applied.kind !== 'copy') return null
  if (op.kind === 'uninstall') return null
  const target: TargetScope = op.target
  const now = new Date().toISOString()
  return {
    opId: randomUUID(),
    type: 'copy',
    customId: op.customId,
    customType: op.customType as InstallableType,
    version: op.toVersion ?? '0.0.0',
    tool,
    target,
    toPath: applied.to,
    fromPath: applied.from,
    installedAt: now,
  }
}

function toolFromDest(destPath: string): Tool {
  return destPath.includes('/.claude/') || destPath.includes('/claude/')
    ? 'claude'
    : 'opencode'
}

export async function executePlan(input: ExecutionInput): Promise<ApplyResponse> {
  const { plan, catalogPath, projectPaths, guide, projects } = input
  const startedAt = Date.now()
  const applyId = randomUUID()
  const executed: ExecutedPhysical[] = []

  const installCount = plan.operations.filter((o) => o.kind === 'install').length
  const upgradeCount = plan.operations.filter((o) => o.kind === 'upgrade').length
  const uninstallCount = plan.operations.filter((o) => o.kind === 'uninstall').length
  const patchCount = plan.patchOperations.length

  if (plan.blockers.length > 0) {
    return {
      applyId,
      result: 'rolled-back',
      backupPath: null,
      error: `cannot apply: ${plan.blockers.length} blocker(s)`,
      durationMs: Date.now() - startedAt,
      installCount,
      upgradeCount,
      uninstallCount,
      patchCount,
    }
  }

  if (plan.operations.length === 0 && plan.patchOperations.length === 0) {
    // Still regenerate the hook registry so orchestrators see the
    // current hook set even when Apply had nothing else to do.
    const tracker = await readTracker(catalogPath)
    let registryError: string | null = null
    try {
      await regenerateHookRegistries({ catalogRoot: catalogPath, tracker, projects })
    } catch (err) {
      registryError = err instanceof Error ? err.message : String(err)
      log.error('hook-registry', 'regen failed (apply was no-op)', { applyId, error: registryError })
    }
    return {
      applyId,
      result: 'success',
      backupPath: null,
      error: registryError ? `hook-registry: ${registryError}` : null,
      durationMs: Date.now() - startedAt,
      installCount,
      upgradeCount,
      uninstallCount,
      patchCount,
    }
  }

  const backup = await createBackup(projectPaths)
  const backupPath = backup?.path ?? null
  if (!backupPath && (plan.operations.length > 0 || plan.patchOperations.length > 0)) {
    log.warn('apply', 'no tar.gz backup — delete ops cannot be reversed if they fail', {
      applyId,
      installs: installCount,
      upgrades: upgradeCount,
      uninstalls: uninstallCount,
      patches: patchCount,
    })
  }

  const home = os.homedir()
  const cleanupStops = [home, ...projectPaths]
  const findStopFor = (destPath: string) => {
    return cleanupStops.find((s) => destPath.startsWith(s + '/')) ?? home
  }

  const appliedPatches: Array<{ op: PlanPatchOp; tracker: PatchTrackerOp }> = []

  try {
    // Phase 1: copy/delete ops for skills/agents.
    for (const op of plan.operations) {
      for (const phys of op.physical) {
        if (phys.kind === 'copy') {
          await copyFile(phys.from, phys.to)
          executed.push({
            op,
            applied: phys,
            trackerOp: opsAsTrackerEntries(op, phys, toolFromDest(phys.to)) ?? undefined,
          })
        } else if (phys.kind === 'delete') {
          const stopAt = findStopFor(phys.path)
          await deleteFileAndCleanup(phys.path, stopAt)
          executed.push({ op, applied: phys })
        }
      }
    }

    // Phase 2: patch applies (all-or-nothing; on failure, we restore tar.gz).
    for (const pop of plan.patchOperations) {
      const result = await executePatchApply({
        catalogPath,
        target: pop.target,
        guide,
      })
      if (!result.skipped) {
        appliedPatches.push({
          op: pop,
          tracker: {
            opId: randomUUID(),
            target: pop.target,
            masterPath: result.masterPath,
            originalBackup: result.originalBackup,
            activeGuideHash: result.activeGuideHash,
            appliedContentHash: result.appliedContentHash,
            installedAt: new Date().toISOString(),
          },
        })
      }
    }

    // Commit tracker.
    const tracker = await readTracker(catalogPath)

    // Drop tracker ops for customs that were upgraded, uninstalled, or
    // freshly installed (replace any prior records).
    const touchedKeys = new Set<string>()
    for (const o of plan.operations) {
      touchedKeys.add(`${o.customType}:${o.customId}`)
    }
    tracker.operations = tracker.operations.filter(
      (existing) => !touchedKeys.has(`${existing.customType}:${existing.customId}`),
    )

    // Add fresh tracker ops for successful copies.
    for (const ex of executed) {
      if (ex.trackerOp && ex.applied.kind === 'copy') {
        const hash = existsSync(ex.applied.to) ? await hashFile(ex.applied.to) : undefined
        tracker.operations.push({ ...ex.trackerOp, contentHash: hash })
      }
    }

    // Replace patches-tracker entries for any master that was re-applied.
    const touchedTargets = new Set(appliedPatches.map((p) => p.op.target))
    tracker.patches = tracker.patches.filter((t) => !touchedTargets.has(t.target))
    for (const ap of appliedPatches) {
      tracker.patches.push(ap.tracker)
    }

    tracker.catalogPath = catalogPath
    tracker.lastApply = new Date().toISOString()
    tracker.lastApplyResult = 'success'
    await writeTracker(tracker)

    let registryError: string | null = null
    try {
      await regenerateHookRegistries({ catalogRoot: catalogPath, tracker, projects })
    } catch (err) {
      registryError = err instanceof Error ? err.message : String(err)
      log.error('hook-registry', 'regen failed', { applyId, error: registryError })
    }

    const duration = Date.now() - startedAt
    await appendHistory({
      applyId,
      timestamp: new Date().toISOString(),
      result: 'success',
      installCount,
      upgradeCount,
      uninstallCount,
      patchCount,
      backupPath,
      error: registryError ? `hook-registry: ${registryError}` : null,
      durationMs: duration,
    })

    return {
      applyId,
      result: 'success',
      backupPath,
      error: registryError ? `hook-registry: ${registryError}` : null,
      durationMs: duration,
      installCount,
      upgradeCount,
      uninstallCount,
      patchCount,
    }
  } catch (err) {
    // Rollback strategy:
    // - If patches were applied, we restore the full tar.gz (cheapest
    //   correct way, since patch reversal requires the pre-state).
    // - Otherwise, reverse copy/delete ops individually.
    let rollbackFailed = false

    if (appliedPatches.length > 0) {
      if (backupPath) {
        try {
          await restoreBackup(backupPath)
        } catch {
          rollbackFailed = true
        }
      } else {
        rollbackFailed = true
      }
    } else {
      for (let i = executed.length - 1; i >= 0; i--) {
        const step = executed[i]!
        try {
          if (step.applied.kind === 'copy') {
            const stopAt = findStopFor(step.applied.to)
            await deleteFileAndCleanup(step.applied.to, stopAt)
          } else if (step.applied.kind === 'delete') {
            if (backupPath) {
              await restoreBackup(backupPath)
              break
            } else {
              rollbackFailed = true
            }
          }
        } catch {
          rollbackFailed = true
        }
      }
    }

    const duration = Date.now() - startedAt
    const errorMsg = err instanceof Error ? err.message : String(err)
    const result = rollbackFailed ? 'rollback-failed' : 'rolled-back'
    log.error('apply', 'failed', {
      applyId,
      result,
      installs: installCount,
      upgrades: upgradeCount,
      uninstalls: uninstallCount,
      patches: patchCount,
      durationMs: duration,
      error: errorMsg,
    })

    // Stamp the tracker so the state reflects the last apply's outcome
    // even when it was a rollback. No op/patch changes survive here
    // (they were reversed) — we only update the result marker + timestamp.
    try {
      const trackerAfter = await readTracker(catalogPath)
      trackerAfter.lastApply = new Date().toISOString()
      trackerAfter.lastApplyResult = result
      await writeTracker(trackerAfter)
    } catch {
      // If we can't even write the tracker, swallow — history.json
      // still records the failure.
    }

    await appendHistory({
      applyId,
      timestamp: new Date().toISOString(),
      result,
      installCount,
      upgradeCount,
      uninstallCount,
      patchCount,
      backupPath,
      error: errorMsg,
      durationMs: duration,
    })

    return {
      applyId,
      result,
      backupPath,
      error: errorMsg,
      durationMs: duration,
      installCount,
      upgradeCount,
      uninstallCount,
      patchCount,
    }
  }
}
