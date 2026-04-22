import { Link } from 'react-router-dom'
import { ErrorBadge } from '../components/ErrorBadge'
import { useCatalogOverview } from '../hooks/useCatalog'

export function Home() {
  const state = useCatalogOverview()

  return (
    <main className="page">
      <header className="page-head">
        <h1>AI Customizer</h1>
        <p className="subtitle">Customization manager for Claude Code and Opencode.</p>
      </header>

      {state.status === 'loading' ? <p className="muted">Loading catalog…</p> : null}

      {state.status === 'error' ? (
        <section className="error-panel">
          <h2>Could not load catalog</h2>
          <p>{state.error.message}</p>
          <p className="muted">
            If the catalog is not at the expected location, set the <code>CATALOG_PATH</code> env var when starting
            the server.
          </p>
        </section>
      ) : null}

      {state.status === 'success' ? (
        <>
          <section className="catalog-meta">
            <div>
              <div className="metric-label">Catalog</div>
              <div className="metric-value">{state.data.name || 'unnamed'}</div>
              <div className="muted monospace">{state.data.catalogPath}</div>
            </div>
          </section>

          <section className="counts-grid">
            <div className="count-card">
              <div className="count-value">{state.data.counts.skills}</div>
              <div className="count-label">Skills</div>
            </div>
            <div className="count-card">
              <div className="count-value">{state.data.counts.agents}</div>
              <div className="count-label">Agents</div>
            </div>
            <div className="count-card">
              <div className="count-value">{state.data.counts.patches}</div>
              <div className="count-label">Patches</div>
            </div>
            <div className="count-card">
              <div className="count-value">{state.data.counts.hooks}</div>
              <div className="count-label">Hooks</div>
            </div>
            {state.data.counts.invalid > 0 ? (
              <div className="count-card count-card-warn">
                <div className="count-value">{state.data.counts.invalid}</div>
                <div className="count-label">Invalid</div>
              </div>
            ) : null}
          </section>

          <section className="home-actions">
            <Link to="/catalog" className="button">
              Browse catalog →
            </Link>
          </section>

          {state.data.issues.length > 0 ? <ErrorBadge issues={state.data.issues} /> : null}

          <section className="home-status muted">
            <strong>Milestone M3</strong> — read-only catalog browser. Install flow arrives in M5.
          </section>
        </>
      ) : null}
    </main>
  )
}
