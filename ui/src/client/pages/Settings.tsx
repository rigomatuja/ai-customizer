import { useState } from 'react'
import { api, ApiClientError } from '../api/client'
import type { Tool } from '../../shared/schemas'
import type { AppStateResponse, ProjectsResponse, ToolDetection } from '../../shared/types'
import type { AsyncState } from '../hooks/useAsync'
import { useAppState, useProjects, useTools } from '../hooks/useAppState'

export function Settings() {
  const { state: stateResult, refetch: refetchState } = useAppState()
  const toolsState = useTools()
  const { state: projectsResult, refetch: refetchProjects } = useProjects()

  return (
    <main className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="subtitle">Configuration + tool detection + known projects.</p>
      </header>

      <CatalogPathPanel state={stateResult} />
      <ToolsPanel tools={toolsState} state={stateResult} onSaved={refetchState} />
      <ProjectsPanel projects={projectsResult} onChanged={refetchProjects} />
    </main>
  )
}

function CatalogPathPanel({ state }: { state: AsyncState<AppStateResponse> }) {
  return (
    <section className="panel">
      <h2>Catalog</h2>
      {state.status === 'loading' ? (
        <p className="muted">Loading…</p>
      ) : state.status === 'error' ? (
        <p className="error">{state.error.message}</p>
      ) : state.status === 'success' ? (
        <dl className="kv">
          <dt>Path</dt>
          <dd>
            <code className="monospace">{state.data.catalogPath}</code>
          </dd>
          <dt>User config dir</dt>
          <dd>
            <code className="monospace">{state.data.userConfigDir}</code>
          </dd>
          <dt>Initialized</dt>
          <dd>{state.data.initialized ? 'yes' : 'no'}</dd>
          {state.data.config ? (
            <>
              <dt>Initialized at</dt>
              <dd className="muted">{state.data.config.createdAt}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <p className="muted small">
        To change the catalog path, stop the UI and restart it from a different catalog clone, or set the{' '}
        <code>CATALOG_PATH</code> env var.
      </p>
    </section>
  )
}

function ToolsPanel({
  tools,
  state,
  onSaved,
}: {
  tools: AsyncState<{ detection: { claude: ToolDetection; opencode: ToolDetection } }>
  state: AsyncState<AppStateResponse>
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [localOverride, setLocalOverride] = useState<{ claude?: boolean; opencode?: boolean } | null>(null)

  if (tools.status !== 'success' || state.status !== 'success') {
    return (
      <section className="panel">
        <h2>Tools</h2>
        {tools.status === 'loading' || state.status === 'loading' ? <p className="muted">Loading…</p> : null}
        {tools.status === 'error' ? <p className="error">{tools.error.message}</p> : null}
        {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}
      </section>
    )
  }

  const currentOverride = localOverride ?? state.data.config?.toolsOverride ?? {}
  const detection = tools.data.detection

  const handleOverride = (tool: Tool, value: boolean | undefined) => {
    setLocalOverride({ ...currentOverride, [tool]: value })
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const cleaned: { claude?: boolean; opencode?: boolean } = {}
      if (typeof currentOverride.claude === 'boolean') cleaned.claude = currentOverride.claude
      if (typeof currentOverride.opencode === 'boolean') cleaned.opencode = currentOverride.opencode
      const payload = Object.keys(cleaned).length > 0 ? cleaned : null
      await api.updateToolsOverride(payload)
      setLocalOverride(null)
      onSaved()
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const dirty = localOverride !== null

  return (
    <section className="panel">
      <h2>Tools</h2>
      <div className="tool-detection-grid">
        <ToolRow
          detection={detection.claude}
          override={currentOverride.claude}
          onChange={(v) => handleOverride('claude', v)}
        />
        <ToolRow
          detection={detection.opencode}
          override={currentOverride.opencode}
          onChange={(v) => handleOverride('opencode', v)}
        />
      </div>
      {saveError ? <p className="error">{saveError}</p> : null}
      <div className="row">
        <button className="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save overrides'}
        </button>
        {dirty ? (
          <button className="button button-secondary" onClick={() => setLocalOverride(null)} disabled={saving}>
            Discard
          </button>
        ) : null}
      </div>
      <p className="muted small">
        Override forces the UI to treat a tool as enabled/disabled regardless of detection. Leave as &ldquo;auto&rdquo; to
        follow detection.
      </p>
    </section>
  )
}

function ToolRow({
  detection,
  override,
  onChange,
}: {
  detection: ToolDetection
  override: boolean | undefined
  onChange: (v: boolean | undefined) => void
}) {
  const value = typeof override === 'boolean' ? (override ? 'enabled' : 'disabled') : 'auto'
  return (
    <div className={`tool-card tool-card-${detection.status}`}>
      <div className="tool-card-head">
        <strong>{detection.tool}</strong>
        <span
          className={`badge badge-${detection.status === 'ok' ? 'ok' : detection.status === 'partial' ? 'warn' : 'error'}`}
        >
          detected: {detection.status}
        </span>
      </div>
      <dl className="kv compact">
        <dt>Binary</dt>
        <dd>{detection.binaryPath ? <code>{detection.binaryPath}</code> : <span className="muted">—</span>}</dd>
        <dt>Config dir</dt>
        <dd>
          <code>{detection.configDir}</code>
          {detection.configExists ? null : <span className="muted"> (missing)</span>}
        </dd>
      </dl>
      <label className="tool-override">
        Override:{' '}
        <select
          value={value}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === 'auto' ? undefined : v === 'enabled')
          }}
        >
          <option value="auto">auto (detection)</option>
          <option value="enabled">enabled</option>
          <option value="disabled">disabled</option>
        </select>
      </label>
    </div>
  )
}

function ProjectsPanel({
  projects,
  onChanged,
}: {
  projects: AsyncState<ProjectsResponse>
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', path: '', repoUrl: '' })
  const [savingAdd, setSavingAdd] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const list = projects.status === 'success' ? projects.data.projects : []

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.path.trim()) {
      setAddError('Name and path are required')
      return
    }
    setSavingAdd(true)
    setAddError(null)
    try {
      await api.createProject({
        name: form.name.trim(),
        path: form.path.trim(),
        repoUrl: form.repoUrl.trim() || undefined,
      })
      setForm({ name: '', path: '', repoUrl: '' })
      setAdding(false)
      onChanged()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingAdd(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project?')) return
    try {
      await api.deleteProject(id)
      onChanged()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="panel">
      <h2>Known projects</h2>
      {projects.status === 'loading' ? <p className="muted">Loading…</p> : null}
      {projects.status === 'error' ? <p className="error">{projects.error.message}</p> : null}

      {projects.status === 'success' && list.length === 0 ? (
        <p className="muted">No projects registered. Add one to enable project-scoped install suggestions.</p>
      ) : null}

      {list.length > 0 ? (
        <ul className="projects-list">
          {list.map((p) => (
            <li key={p.id} className="projects-item">
              <div className="projects-item-main">
                <strong>{p.name}</strong>
                <code className="muted small">{p.path}</code>
                {p.repoUrl ? (
                  <a href={p.repoUrl} target="_blank" rel="noreferrer" className="small">
                    {p.repoUrl}
                  </a>
                ) : null}
              </div>
              <button className="button button-danger button-sm" onClick={() => handleDelete(p.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form className="projects-add-form" onSubmit={handleAdd}>
          <div className="form-row">
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="gentle-ai"
                required
              />
            </label>
            <label>
              Path
              <input
                type="text"
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
                placeholder="/home/user/code/gentle-ai"
                required
              />
            </label>
            <label>
              Repo URL (optional)
              <input
                type="url"
                value={form.repoUrl}
                onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                placeholder="https://github.com/..."
              />
            </label>
          </div>
          {addError ? <p className="error">{addError}</p> : null}
          <div className="row">
            <button className="button" type="submit" disabled={savingAdd}>
              {savingAdd ? 'Saving…' : 'Add project'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setAdding(false)
                setForm({ name: '', path: '', repoUrl: '' })
                setAddError(null)
              }}
              disabled={savingAdd}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="button" onClick={() => setAdding(true)}>
          + Add project
        </button>
      )}
    </section>
  )
}
