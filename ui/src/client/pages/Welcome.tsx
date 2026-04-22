import { useState } from 'react'
import { api } from '../api/client'
import { useTools } from '../hooks/useAppState'
import type { ToolDetection } from '../../shared/types'

interface WelcomeProps {
  catalogPath: string
  userConfigDir: string
  onInitialized: () => void
}

export function Welcome({ catalogPath, userConfigDir, onInitialized }: WelcomeProps) {
  const tools = useTools()
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleInit = async () => {
    setError(null)
    setInitializing(true)
    try {
      await api.initState()
      onInitialized()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setInitializing(false)
    }
  }

  return (
    <main className="page welcome-page">
      <header className="page-head">
        <h1>Welcome to AI Customizer</h1>
        <p className="subtitle">Let&apos;s do a quick setup before you start.</p>
      </header>

      <section className="panel">
        <h2>Step 1 · Catalog</h2>
        <p>
          This UI is running from the catalog repo located at:
        </p>
        <code className="monospace code-block">{catalogPath}</code>
        <p className="muted">
          If that&apos;s not the right path, stop this server, clone the right template somewhere else, and run{' '}
          <code>npm run dev</code> from the <code>ui/</code> directory of THAT clone.
        </p>
      </section>

      <section className="panel">
        <h2>Step 2 · State directory</h2>
        <p>Your local state (tracker, history, backups) will live in:</p>
        <code className="monospace code-block">{userConfigDir}</code>
      </section>

      <section className="panel">
        <h2>Step 3 · Tool detection</h2>
        {tools.status === 'loading' || tools.status === 'idle' ? (
          <p className="muted">Detecting Claude and Opencode…</p>
        ) : tools.status === 'error' ? (
          <p className="error">Failed to detect tools: {tools.error.message}</p>
        ) : (
          <div className="tool-detection-grid">
            <ToolDetectionCard detection={tools.data.detection.claude} />
            <ToolDetectionCard detection={tools.data.detection.opencode} />
          </div>
        )}
        <p className="muted">
          You&apos;ll be able to override detection manually from Settings after setup.
        </p>
      </section>

      <section className="panel">
        <h2>Step 4 · Initialize</h2>
        <p>
          This creates <code>config.json</code> and supporting files in your user config dir. Non-destructive and
          reversible (you can delete the dir at any time).
        </p>
        {error ? <p className="error">{error}</p> : null}
        <button className="button" onClick={handleInit} disabled={initializing}>
          {initializing ? 'Initializing…' : 'Initialize'}
        </button>
      </section>

      <section className="welcome-footer muted">
        <strong>Note:</strong> the manager agent will be installed in a later milestone (M8). For now, after init
        you&apos;ll see an empty catalog.
      </section>
    </main>
  )
}

function ToolDetectionCard({ detection }: { detection: ToolDetection }) {
  const statusLabel = detection.status === 'ok' ? 'OK' : detection.status === 'partial' ? 'Partial' : 'Missing'
  return (
    <div className={`tool-card tool-card-${detection.status}`}>
      <div className="tool-card-head">
        <strong>{detection.tool}</strong>
        <span className={`badge badge-${detection.status === 'ok' ? 'ok' : detection.status === 'partial' ? 'warn' : 'error'}`}>
          {statusLabel}
        </span>
      </div>
      <dl className="kv compact">
        <dt>Binary</dt>
        <dd>
          {detection.binaryPath ? (
            <code className="monospace">{detection.binaryPath}</code>
          ) : (
            <span className="muted">not found in PATH</span>
          )}
        </dd>
        <dt>Config dir</dt>
        <dd>
          <code className="monospace">{detection.configDir}</code>
          {detection.configExists ? null : <span className="muted"> (missing)</span>}
        </dd>
      </dl>
    </div>
  )
}
