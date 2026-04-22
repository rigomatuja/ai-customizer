import { useEffect, useState } from 'react'
import type { Tool } from '../../shared/schemas'
import type { ToolDetection } from '../../shared/types'
import { api } from '../api/client'
import { useTools } from '../hooks/useAppState'

interface WelcomeProps {
  catalogPath: string
  userConfigDir: string
  onInitialized: () => void
}

type Step = 1 | 2

export function Welcome({ catalogPath, userConfigDir, onInitialized }: WelcomeProps) {
  const tools = useTools()
  const [step, setStep] = useState<Step>(1)
  const [initializing, setInitializing] = useState(false)
  const [installingManager, setInstallingManager] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTools, setSelectedTools] = useState<Record<Tool, boolean>>({
    claude: true,
    opencode: true,
  })

  useEffect(() => {
    if (tools.status !== 'success') return
    setSelectedTools({
      claude: tools.data.detection.claude.status !== 'missing',
      opencode: tools.data.detection.opencode.status !== 'missing',
    })
  }, [tools])

  const handleInit = async () => {
    setError(null)
    setInitializing(true)
    try {
      await api.initState()
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInitializing(false)
    }
  }

  const handleInstallManager = async (doInstall: boolean) => {
    setError(null)
    if (!doInstall) {
      onInitialized()
      return
    }
    const tools: Tool[] = []
    if (selectedTools.claude) tools.push('claude')
    if (selectedTools.opencode) tools.push('opencode')
    if (tools.length === 0) {
      onInitialized()
      return
    }
    setInstallingManager(true)
    try {
      await api.installManager(tools)
      onInitialized()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingManager(false)
    }
  }

  return (
    <main className="page welcome-page">
      <header className="page-head">
        <h1>Welcome to AI Customizer</h1>
        <p className="subtitle">Quick setup — two steps.</p>
      </header>

      {step === 1 ? (
        <>
          <section className="panel">
            <h2>Step 1a · Catalog</h2>
            <p>This UI is running from the catalog repo at:</p>
            <code className="monospace code-block">{catalogPath}</code>
            <p className="muted small">
              If that&apos;s not where you want your catalog, stop this server, clone elsewhere, and run{' '}
              <code>npm run dev</code> from that clone&apos;s <code>ui/</code>.
            </p>
          </section>

          <section className="panel">
            <h2>Step 1b · State directory</h2>
            <p>Your local state (tracker, history, backups) lives in:</p>
            <code className="monospace code-block">{userConfigDir}</code>
          </section>

          <section className="panel">
            <h2>Step 1c · Tool detection</h2>
            {tools.status === 'loading' || tools.status === 'idle' ? (
              <p className="muted">Detecting Claude and Opencode…</p>
            ) : tools.status === 'error' ? (
              <p className="error">{tools.error.message}</p>
            ) : (
              <div className="tool-detection-grid">
                <ToolDetectionCard detection={tools.data.detection.claude} />
                <ToolDetectionCard detection={tools.data.detection.opencode} />
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Step 1d · Initialize</h2>
            <p>
              Creates <code>config.json</code> and supporting files in your user config dir. Non-destructive.
            </p>
            {error ? <p className="error">{error}</p> : null}
            <button className="button" onClick={handleInit} disabled={initializing}>
              {initializing ? 'Initializing…' : 'Initialize'}
            </button>
          </section>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <section className="panel">
            <h2>Step 2 · Install the manager</h2>
            <p>
              The <strong>manager</strong> is a global agent you invoke from Claude or Opencode. It helps you
              create, improve, version, and classify customs — without touching your filesystem directly.
            </p>
            <p className="muted small">
              Source: <code>manager/v0.1.0/&lt;tool&gt;/manager.md</code> in the catalog. Installs as a tool-native
              agent file.
            </p>
            <fieldset className="install-group">
              <legend>Install for</legend>
              <label>
                <input
                  type="checkbox"
                  checked={selectedTools.claude}
                  onChange={(e) => setSelectedTools({ ...selectedTools, claude: e.target.checked })}
                />{' '}
                Claude → <code>~/.claude/agents/manager.md</code>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selectedTools.opencode}
                  onChange={(e) => setSelectedTools({ ...selectedTools, opencode: e.target.checked })}
                />{' '}
                Opencode → <code>~/.config/opencode/agent/manager.md</code>
              </label>
            </fieldset>
            {error ? <p className="error">{error}</p> : null}
            <div className="row">
              <button
                className="button"
                onClick={() => handleInstallManager(true)}
                disabled={installingManager || (!selectedTools.claude && !selectedTools.opencode)}
              >
                {installingManager ? 'Installing manager…' : 'Install manager + continue'}
              </button>
              <button
                className="button button-secondary"
                onClick={() => handleInstallManager(false)}
                disabled={installingManager}
              >
                Skip (install later from Settings)
              </button>
            </div>
          </section>
        </>
      ) : null}

      <section className="welcome-footer muted">
        <strong>Tip:</strong> after setup, hand-author a skill in <code>customizations/skills/&lt;id&gt;/</code>{' '}
        to see it appear in the catalog browser, or invoke the manager from Claude/Opencode to have it create
        one for you.
      </section>
    </main>
  )
}

function ToolDetectionCard({ detection }: { detection: ToolDetection }) {
  const statusLabel =
    detection.status === 'ok' ? 'OK' : detection.status === 'partial' ? 'Partial' : 'Missing'
  return (
    <div className={`tool-card tool-card-${detection.status}`}>
      <div className="tool-card-head">
        <strong>{detection.tool}</strong>
        <span
          className={`badge badge-${detection.status === 'ok' ? 'ok' : detection.status === 'partial' ? 'warn' : 'error'}`}
        >
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
