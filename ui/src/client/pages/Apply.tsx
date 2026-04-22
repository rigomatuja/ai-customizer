import { useState } from 'react'
import { api, ApiClientError } from '../api/client'
import { usePlan } from '../hooks/useInstall'
import type { ApplyResponse, Plan, PlanOperation } from '../../shared/types'

export function Apply() {
  const { state, refetch } = usePlan()
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<ApplyResponse | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  const handleApply = async () => {
    setApplying(true)
    setApplyError(null)
    try {
      const res = await api.apply()
      setResult(res)
      refetch()
    } catch (err) {
      setApplyError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>Apply plan</h1>
        <p className="subtitle">
          Sync your filesystem with the desired state (active installations + catalog versions).
        </p>
      </header>

      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="muted">Computing plan…</p>
      ) : null}

      {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}

      {state.status === 'success' ? (
        <>
          {result ? <ApplyResultPanel result={result} /> : null}

          <PlanSummary plan={state.data} />

          {state.data.blockers.length > 0 ? (
            <section className="panel error-panel">
              <h2>Blockers (apply disabled)</h2>
              <ul>
                {state.data.blockers.map((b, i) => (
                  <li key={i}>
                    <strong>{b.code}</strong>: {b.message}
                    {b.customId ? (
                      <>
                        {' '}
                        <code>({b.customId})</code>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.data.warnings.length > 0 ? (
            <section className="issues issues-warn">
              <strong>Warnings</strong>
              <ul>
                {state.data.warnings.map((w, i) => (
                  <li key={i}>
                    <strong>{w.code}</strong>: {w.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {state.data.operations.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing to apply</h3>
              <p className="muted">Your filesystem matches the desired state.</p>
            </div>
          ) : (
            <>
              <section className="panel">
                <h2>Operations ({state.data.operations.length})</h2>
                <ul className="plan-ops">
                  {state.data.operations.map((op, i) => (
                    <li key={i}>
                      <OperationRow op={op} />
                    </li>
                  ))}
                </ul>
              </section>

              {applyError ? <p className="error">{applyError}</p> : null}
              <div className="row">
                <button
                  className="button"
                  onClick={handleApply}
                  disabled={applying || state.data.blockers.length > 0}
                >
                  {applying ? 'Applying…' : 'Apply plan'}
                </button>
                <button className="button button-secondary" onClick={refetch} disabled={applying}>
                  Refresh plan
                </button>
              </div>
              {state.data.backupWillBeCreated ? (
                <p className="muted small">A tar.gz backup will be created before Apply runs.</p>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </main>
  )
}

function PlanSummary({ plan }: { plan: Plan }) {
  const counts = {
    install: plan.operations.filter((o) => o.kind === 'install').length,
    upgrade: plan.operations.filter((o) => o.kind === 'upgrade').length,
    uninstall: plan.operations.filter((o) => o.kind === 'uninstall').length,
  }
  return (
    <section className="counts-grid">
      <div className="count-card">
        <div className="count-value">{counts.install}</div>
        <div className="count-label">Install</div>
      </div>
      <div className="count-card">
        <div className="count-value">{counts.upgrade}</div>
        <div className="count-label">Upgrade</div>
      </div>
      <div className="count-card">
        <div className="count-value">{counts.uninstall}</div>
        <div className="count-label">Uninstall</div>
      </div>
      <div className="count-card">
        <div className="count-value">{plan.currentInstalledCount}</div>
        <div className="count-label">Currently installed</div>
      </div>
    </section>
  )
}

function OperationRow({ op }: { op: PlanOperation }) {
  const kindColor =
    op.kind === 'install' ? 'ok' : op.kind === 'upgrade' ? 'warn' : 'error'
  return (
    <div className="plan-op">
      <div className="plan-op-head">
        <span className={`badge badge-${kindColor}`}>{op.kind}</span>
        <code>
          {op.customType}:{op.customId}
        </code>
        <span className="muted small">
          {op.fromVersion ? `v${op.fromVersion} → ` : ''}
          {op.toVersion ? `v${op.toVersion}` : ''}
        </span>
        <span className="muted small">
          target: {op.target.scope}
          {op.target.scope === 'project' ? ` (${op.target.projectId})` : ''}
        </span>
        <span className="muted small">tools: {op.tools.join(', ')}</span>
      </div>
      <ul className="plan-physicals">
        {op.physical.map((p, i) => (
          <li key={i}>
            {p.kind === 'copy' ? (
              <>
                <code className="small">copy</code> → <code className="small">{p.to}</code>
              </>
            ) : (
              <>
                <code className="small">delete</code> <code className="small">{p.path}</code>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ApplyResultPanel({ result }: { result: ApplyResponse }) {
  const color =
    result.result === 'success' ? 'ok' : result.result === 'rolled-back' ? 'warn' : 'error'
  return (
    <section className={`panel ${result.result !== 'success' ? 'error-panel' : ''}`}>
      <h2>Last apply result</h2>
      <div className="row">
        <span className={`badge badge-${color}`}>{result.result}</span>
        <span className="muted small">id: {result.applyId}</span>
        <span className="muted small">{result.durationMs}ms</span>
      </div>
      <dl className="kv compact">
        <dt>Installs</dt>
        <dd>{result.installCount}</dd>
        <dt>Upgrades</dt>
        <dd>{result.upgradeCount}</dd>
        <dt>Uninstalls</dt>
        <dd>{result.uninstallCount}</dd>
        {result.backupPath ? (
          <>
            <dt>Backup</dt>
            <dd>
              <code className="small">{result.backupPath}</code>
            </dd>
          </>
        ) : null}
        {result.error ? (
          <>
            <dt>Error</dt>
            <dd className="error">{result.error}</dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}
