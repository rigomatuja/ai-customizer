import { existsSync } from 'node:fs'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type {
  InstallableType,
  TargetScope,
  Tool,
  TrackerOp,
} from '../../shared/schemas'
import type {
  ApplyResponse,
  PhysicalOp,
  Plan,
  PlanOperation,
} from '../../shared/types'
import { appendHistory } from '../state/history'
import { readTracker, writeTracker } from '../state/tracker'
import { createBackup, restoreBackup } from './backup'
import { copyFile, deleteFileAndCleanup, hashFile } from './fs-utils'

interface ExecutionInput {
  plan: Plan
  catalogPath: string
  projectPaths: string[]
}

interface ExecutedPhysical {
  op: PlanOperation
  applied: PhysicalOp
  // For 'copy', may record tracker data (contentHash, etc).
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
  const { plan, catalogPath, projectPaths } = input
  const startedAt = Date.now()
  const applyId = randomUUID()
  const executed: ExecutedPhysical[] = []

  const installCount = plan.operations.filter((o) => o.kind === 'install').length
  const upgradeCount = plan.operations.filter((o) => o.kind === 'upgrade').length
  const uninstallCount = plan.operations.filter((o) => o.kind === 'uninstall').length

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
    }
  }

  if (plan.operations.length === 0) {
    return {
      applyId,
      result: 'success',
      backupPath: null,
      error: null,
      durationMs: Date.now() - startedAt,
      installCount,
      upgradeCount,
      uninstallCount,
    }
  }

  const backup = await createBackup(projectPaths)
  const backupPath = backup?.path ?? null

  const home = os.homedir()
  const cleanupStops = [home, ...projectPaths]

  const findStopFor = (destPath: string) => {
    return cleanupStops.find((s) => destPath.startsWith(s + '/')) ?? home
  }

  try {
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

    // Commit tracker
    const tracker = await readTracker(catalogPath)

    // Remove existing ops for customs that were upgraded or uninstalled
    const touchedKeys = new Set<string>()
    for (const o of plan.operations) {
      if (o.kind === 'upgrade' || o.kind === 'uninstall') {
        touchedKeys.add(`${o.customType}:${o.customId}`)
      }
    }
    tracker.operations = tracker.operations.filter(
      (existing) => !touchedKeys.has(`${existing.customType}:${existing.customId}`),
    )

    // Also remove ops whose destination was overwritten by a fresh install (same key)
    for (const o of plan.operations) {
      if (o.kind === 'install') {
        const key = `${o.customType}:${o.customId}`
        tracker.operations = tracker.operations.filter(
          (ex) => `${ex.customType}:${ex.customId}` !== key,
        )
      }
    }

    // Add fresh tracker ops from executed copies
    for (const ex of executed) {
      if (ex.trackerOp && ex.applied.kind === 'copy') {
        const hash = existsSync(ex.applied.to) ? await hashFile(ex.applied.to) : undefined
        tracker.operations.push({ ...ex.trackerOp, contentHash: hash })
      }
    }

    tracker.catalogPath = catalogPath
    tracker.lastApply = new Date().toISOString()
    await writeTracker(tracker)

    const duration = Date.now() - startedAt
    await appendHistory({
      applyId,
      timestamp: new Date().toISOString(),
      result: 'success',
      installCount,
      upgradeCount,
      uninstallCount,
      backupPath,
      error: null,
      durationMs: duration,
    })

    return {
      applyId,
      result: 'success',
      backupPath,
      error: null,
      durationMs: duration,
      installCount,
      upgradeCount,
      uninstallCount,
    }
  } catch (err) {
    // Rollback: reverse executed physicals in reverse order.
    let rollbackFailed = false
    for (let i = executed.length - 1; i >= 0; i--) {
      const step = executed[i]!
      try {
        if (step.applied.kind === 'copy') {
          const stopAt = findStopFor(step.applied.to)
          await deleteFileAndCleanup(step.applied.to, stopAt)
        }
        // For 'delete' we cannot recover content without backup restore.
        if (step.applied.kind === 'delete') {
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

    const duration = Date.now() - startedAt
    const errorMsg = err instanceof Error ? err.message : String(err)
    const result = rollbackFailed ? 'rollback-failed' : 'rolled-back'
    await appendHistory({
      applyId,
      timestamp: new Date().toISOString(),
      result,
      installCount,
      upgradeCount,
      uninstallCount,
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
    }
  }
}
