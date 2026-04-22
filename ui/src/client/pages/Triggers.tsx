import { useState } from 'react'
import { api, ApiClientError } from '../api/client'
import { useAsyncWithRefetch } from '../hooks/useAsync'

export function Triggers() {
  const { state, refetch } = useAsyncWithRefetch(() => api.triggers(), [])
  const registry = useAsyncWithRefetch(() => api.hookRegistry(), [])

  const [newTrigger, setNewTrigger] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTrigger.trim()) return
    setSaving(true)
    setAddError(null)
    try {
      await api.addTrigger(newTrigger.trim())
      setNewTrigger('')
      refetch()
    } catch (err) {
      setAddError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (trigger: string) => {
    if (!confirm(`Remove trigger "${trigger}" from the vocabulary?`)) return
    try {
      await api.removeTrigger(trigger)
      refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>Hook triggers</h1>
        <p className="subtitle">
          Vocabulary the manager uses to validate hooks + auto-fire canonical set for orchestrators.
        </p>
      </header>

      <section className="panel">
        <h2>Vocabulary (<code>.ai-customizer/triggers.json</code>)</h2>
        {state.status === 'loading' ? <p className="muted">Loading…</p> : null}
        {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}
        {state.status === 'success' ? (
          <>
            {state.data.triggers.length === 0 ? (
              <p className="muted">No triggers defined yet.</p>
            ) : (
              <ul className="triggers-vocab-list">
                {state.data.triggers.map((t) => (
                  <li key={t}>
                    <code>{t}</code>
                    <button
                      className="button button-danger button-sm"
                      onClick={() => handleDelete(t)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="row" onSubmit={handleAdd} style={{ marginTop: '1rem', gap: '0.5rem' }}>
              <input
                type="text"
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                placeholder="phase:my-workflow:post-step"
                style={{
                  flex: 1,
                  padding: '0.4rem 0.6rem',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--fg)',
                  fontFamily: 'inherit',
                }}
              />
              <button className="button" type="submit" disabled={saving || !newTrigger.trim()}>
                {saving ? 'Adding…' : 'Add'}
              </button>
            </form>
            {addError ? <p className="error">{addError}</p> : null}
            <p className="muted small">
              Format: <code>&lt;type&gt;:&lt;target&gt;</code>. Wildcards allowed with <code>*</code>{' '}
              (e.g. <code>agent-event:*:complete</code>).
            </p>
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>Current hook registry</h2>
        <p className="muted small">
          Read-only view of{' '}
          <code>~/.config/ai-customizer/hook-registry.json</code> — regenerated on every Apply.
        </p>
        {registry.state.status === 'loading' ? <p className="muted">Loading…</p> : null}
        {registry.state.status === 'error' ? (
          <p className="error">{registry.state.error.message}</p>
        ) : null}
        {registry.state.status === 'success' ? (
          <>
            <p className="muted small">
              Generated: {registry.state.data.generatedAt || 'never'} · {registry.state.data.hooks.length}{' '}
              hook(s)
            </p>
            {registry.state.data.hooks.length === 0 ? (
              <p className="muted">
                No hooks currently registered. Install a skill/agent whose manifest carries a{' '}
                <code>hook</code> field and run Apply.
              </p>
            ) : (
              <ul className="hook-reg-list">
                {registry.state.data.hooks.map((h, i) => (
                  <li key={i} className="hook-reg-item">
                    <header>
                      <strong>{h.customType}:{h.customId}</strong>
                      <span className="badge badge-ok">v{h.version}</span>
                      <span className="muted small">tool: {h.tool}</span>
                      <span className="muted small">scope: {h.scope}</span>
                      {h.onFail ? <span className="muted small">onFail: {h.onFail}</span> : null}
                    </header>
                    <ul className="triggers-list">
                      {h.triggers.map((t, j) => (
                        <li key={j}>
                          <span className="trigger-type">{t.type}</span>
                          <code>{t.target}</code>
                        </li>
                      ))}
                    </ul>
                    <code className="muted small">{h.installedPath}</code>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </main>
  )
}
