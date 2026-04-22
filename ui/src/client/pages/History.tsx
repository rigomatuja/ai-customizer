import { useHistory } from '../hooks/useInstall'

export function History() {
  const { state, refetch } = useHistory()

  return (
    <main className="page">
      <header className="page-head">
        <h1>History</h1>
        <p className="subtitle">Audit log of Apply operations.</p>
      </header>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <button className="button button-secondary" onClick={refetch}>
          Refresh
        </button>
      </div>

      {state.status === 'loading' ? <p className="muted">Loading…</p> : null}
      {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}
      {state.status === 'success' ? (
        state.data.entries.length === 0 ? (
          <div className="empty-state">
            <h3>No Apply operations yet</h3>
            <p className="muted">Once you activate a custom and click Apply, it will show up here.</p>
          </div>
        ) : (
          <ul className="history-list">
            {state.data.entries.map((e) => {
              const color =
                e.result === 'success' ? 'ok' : e.result === 'rolled-back' ? 'warn' : 'error'
              return (
                <li key={e.applyId} className="history-item">
                  <header>
                    <span className={`badge badge-${color}`}>{e.result}</span>
                    <span className="muted">{e.timestamp}</span>
                    <span className="muted small">{e.durationMs}ms</span>
                  </header>
                  <dl className="kv compact">
                    <dt>id</dt>
                    <dd>
                      <code className="small">{e.applyId}</code>
                    </dd>
                    <dt>ops</dt>
                    <dd>
                      {e.installCount} install, {e.upgradeCount} upgrade, {e.uninstallCount} uninstall
                    </dd>
                    {e.backupPath ? (
                      <>
                        <dt>backup</dt>
                        <dd>
                          <code className="small">{e.backupPath}</code>
                        </dd>
                      </>
                    ) : null}
                    {e.error ? (
                      <>
                        <dt>error</dt>
                        <dd className="error">{e.error}</dd>
                      </>
                    ) : null}
                  </dl>
                </li>
              )
            })}
          </ul>
        )
      ) : null}
    </main>
  )
}
