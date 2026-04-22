import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  ApplicationGuide as Guide,
  GuideEntry,
  PatchMasterName,
} from '../../shared/schemas'
import type { CustomSummary } from '../../shared/types'
import { api, ApiClientError } from '../api/client'
import { useCustomsList } from '../hooks/useCatalog'
import { useGuide } from '../hooks/useGuide'

type Target = PatchMasterName
const TARGETS: Target[] = ['CLAUDE.md', 'AGENTS.md']

export function ApplicationGuide() {
  const { state: guideState, refetch } = useGuide()
  const customs = useCustomsList()
  const [opError, setOpError] = useState<string | null>(null)

  const patchSummaries = useMemo<CustomSummary[]>(() => {
    if (customs.status !== 'success') return []
    return customs.data.customs.filter((c) => c.type === 'patch')
  }, [customs])

  const handleToggle = async (target: Target, entry: GuideEntry, active: boolean) => {
    setOpError(null)
    try {
      await api.upsertGuideEntry(target, { ...entry, active })
      refetch()
    } catch (e) {
      setOpError(e instanceof ApiClientError ? e.message : String(e))
    }
  }

  const handleVersionChange = async (target: Target, entry: GuideEntry, version: string) => {
    setOpError(null)
    try {
      await api.upsertGuideEntry(target, { ...entry, version })
      refetch()
    } catch (e) {
      setOpError(e instanceof ApiClientError ? e.message : String(e))
    }
  }

  const handleDelete = async (target: Target, patchId: string) => {
    if (!confirm(`Remove "${patchId}" from ${target} guide?`)) return
    setOpError(null)
    try {
      await api.removeGuideEntry(target, patchId)
      refetch()
    } catch (e) {
      setOpError(e instanceof ApiClientError ? e.message : String(e))
    }
  }

  const handleMoveUp = async (target: Target, patchId: string, list: GuideEntry[]) => {
    const idx = list.findIndex((e) => e.patchId === patchId)
    if (idx <= 0) return
    const reordered = [...list]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(idx - 1, 0, moved!)
    setOpError(null)
    try {
      await api.reorderGuide(
        target,
        reordered.map((e) => e.patchId),
      )
      refetch()
    } catch (e) {
      setOpError(e instanceof ApiClientError ? e.message : String(e))
    }
  }

  const handleMoveDown = async (target: Target, patchId: string, list: GuideEntry[]) => {
    const idx = list.findIndex((e) => e.patchId === patchId)
    if (idx < 0 || idx >= list.length - 1) return
    const reordered = [...list]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(idx + 1, 0, moved!)
    setOpError(null)
    try {
      await api.reorderGuide(
        target,
        reordered.map((e) => e.patchId),
      )
      refetch()
    } catch (e) {
      setOpError(e instanceof ApiClientError ? e.message : String(e))
    }
  }

  const handleAdd = async (target: Target, summary: CustomSummary) => {
    setOpError(null)
    try {
      await api.upsertGuideEntry(target, {
        patchId: summary.id,
        version: summary.activeVersion,
        active: true,
        order: 9999,
      })
      refetch()
    } catch (e) {
      setOpError(e instanceof ApiClientError ? e.message : String(e))
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>Application Guide</h1>
        <p className="subtitle">
          Order + activation of patches per master file. Applied at Apply time in order.
        </p>
      </header>

      {opError ? <p className="error">{opError}</p> : null}

      {guideState.status === 'loading' ? <p className="muted">Loading…</p> : null}
      {guideState.status === 'error' ? (
        <p className="error">{guideState.error.message}</p>
      ) : null}

      {guideState.status === 'success' ? (
        TARGETS.map((target) => (
          <TargetSection
            key={target}
            target={target}
            guide={guideState.data.guide}
            patches={patchSummaries}
            onToggle={handleToggle}
            onVersionChange={handleVersionChange}
            onDelete={handleDelete}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onAdd={handleAdd}
          />
        ))
      ) : null}

      <p className="muted small">
        Changes here stage the guide. Run <Link to="/apply">Apply</Link> to rewrite the master file.
      </p>
    </main>
  )
}

interface TargetSectionProps {
  target: Target
  guide: Guide
  patches: CustomSummary[]
  onToggle: (target: Target, entry: GuideEntry, active: boolean) => void
  onVersionChange: (target: Target, entry: GuideEntry, version: string) => void
  onDelete: (target: Target, patchId: string) => void
  onMoveUp: (target: Target, patchId: string, list: GuideEntry[]) => void
  onMoveDown: (target: Target, patchId: string, list: GuideEntry[]) => void
  onAdd: (target: Target, summary: CustomSummary) => void
}

function TargetSection({
  target,
  guide,
  patches,
  onToggle,
  onVersionChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAdd,
}: TargetSectionProps) {
  const list = [...guide.targets[target]].sort((a, b) => a.order - b.order)
  const presentIds = new Set(list.map((e) => e.patchId))
  const addableForTarget = patches.filter((p) => !presentIds.has(p.id) && p.valid)

  return (
    <section className="panel">
      <h2>{target}</h2>

      {list.length === 0 ? (
        <p className="muted">No patches in guide for this target.</p>
      ) : (
        <ol className="guide-list">
          {list.map((entry, idx) => {
            const summary = patches.find((p) => p.id === entry.patchId)
            const versions = summary?.versionCount ?? 0
            return (
              <li key={entry.patchId} className="guide-entry">
                <div className="guide-order">#{entry.order + 1}</div>
                <div className="guide-main">
                  <div className="guide-title-row">
                    <code>{entry.patchId}</code>
                    {summary ? (
                      <span className="muted small">{summary.name}</span>
                    ) : (
                      <span className="badge badge-error">not in catalog</span>
                    )}
                  </div>
                  <div className="guide-controls">
                    <label className="small">
                      <input
                        type="checkbox"
                        checked={entry.active}
                        onChange={(e) => onToggle(target, entry, e.target.checked)}
                      />{' '}
                      active
                    </label>
                    <label className="small">
                      version:{' '}
                      <input
                        type="text"
                        value={entry.version}
                        onChange={(e) => onVersionChange(target, entry, e.target.value)}
                        size={8}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          padding: '0.15rem 0.4rem',
                        }}
                      />
                      {summary ? (
                        <span className="muted small"> (catalog: {versions} version{versions === 1 ? '' : 's'})</span>
                      ) : null}
                    </label>
                  </div>
                </div>
                <div className="guide-actions">
                  <button
                    className="button button-secondary button-sm"
                    onClick={() => onMoveUp(target, entry.patchId, list)}
                    disabled={idx === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="button button-secondary button-sm"
                    onClick={() => onMoveDown(target, entry.patchId, list)}
                    disabled={idx === list.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    className="button button-danger button-sm"
                    onClick={() => onDelete(target, entry.patchId)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {addableForTarget.length > 0 ? (
        <details className="guide-add-details">
          <summary>Add a patch from catalog…</summary>
          <ul className="guide-add-list">
            {addableForTarget.map((p) => (
              <li key={p.id}>
                <span>
                  <code>{p.id}</code> <span className="muted small">{p.name}</span>
                </span>
                <button className="button button-sm" onClick={() => onAdd(target, p)}>
                  Add to {target}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="muted small">All catalog patches are already in this guide.</p>
      )}
    </section>
  )
}
