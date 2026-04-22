import { useState } from 'react'
import { api, ApiClientError } from '../api/client'
import type { Tool } from '../../shared/schemas'
import type { AppStateResponse, ProjectsResponse, ToolDetection } from '../../shared/types'
import { useAsyncWithRefetch, type AsyncState } from '../hooks/useAsync'
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
      <ManagerPanel />
      <ToolsPanel tools={toolsState} state={stateResult} onSaved={refetchState} />
      <ProjectsPanel projects={projectsResult} onChanged={refetchProjects} />
      <OrphansPanel />
    </main>
  )
}

function ManagerPanel() {
  const { state, refetch } = useAsyncWithRefetch(() => api.managerStatus(), [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (state.status !== 'success') {
    return (
      <section className="panel">
        <h2>Manager agent</h2>
        {state.status === 'loading' ? <p className="muted">Loading…</p> : null}
        {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}
      </section>
    )
  }

  const status = state.data
  const installedTools: Tool[] = (['claude', 'opencode'] as Tool[]).filter(
    (t) => status.installed[t].installed,
  )
  const notInstalledTools: Tool[] = (['claude', 'opencode'] as Tool[]).filter(
    (t) => !status.installed[t].installed,
  )

  const handleInstall = async (tools: Tool[]) => {
    setBusy(true)
    setErr(null)
    try {
      await api.installManager(tools)
      refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleUninstall = async () => {
    if (!confirm('Uninstall the manager from all tools?')) return
    setBusy(true)
    setErr(null)
    try {
      await api.uninstallManager()
      refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Manager agent</h2>
      {!status.present ? (
        <p className="error">
          Manager is not present in the catalog (looked for <code>manager/manifest.json</code>). Your catalog
          may be incomplete.
        </p>
      ) : (
        <>
          <dl className="kv compact">
            <dt>Catalog version</dt>
            <dd>v{status.catalogVersion ?? '?'}</dd>
            {(['claude', 'opencode'] as Tool[]).map((t) => (
              <FragmentLine
                key={t}
                label={t}
                info={status.installed[t]}
                catalogVersion={status.catalogVersion}
              />
            ))}
          </dl>
          {err ? <p className="error">{err}</p> : null}
          <div className="row">
            {notInstalledTools.length > 0 ? (
              <button
                className="button"
                onClick={() => handleInstall(notInstalledTools)}
                disabled={busy}
              >
                Install on {notInstalledTools.join(', ')}
              </button>
            ) : null}
            {installedTools.length > 0 ? (
              <button
                className="button button-secondary"
                onClick={() => handleInstall(installedTools)}
                disabled={busy}
              >
                Reinstall on {installedTools.join(', ')}
              </button>
            ) : null}
            {installedTools.length > 0 ? (
              <button className="button button-danger" onClick={handleUninstall} disabled={busy}>
                Uninstall
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

function FragmentLine({
  label,
  info,
  catalogVersion,
}: {
  label: string
  info: { installed: boolean; path: string; version: string | null }
  catalogVersion: string | null
}) {
  const outOfDate =
    info.installed && info.version && catalogVersion && info.version !== catalogVersion
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {info.installed ? (
          <>
            <span className={`badge badge-${outOfDate ? 'warn' : 'ok'}`}>
              v{info.version ?? '?'}
              {outOfDate ? ` (catalog has v${catalogVersion})` : ''}
            </span>{' '}
            <code className="small">{info.path}</code>
          </>
        ) : (
          <span className="muted">not installed — <code className="small">{info.path}</code></span>
        )}
      </dd>
    </>
  )
}

function OrphansPanel() {
  const { state, refetch } = useAsyncWithRefetch(() => api.orphans(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const handleForceUninstall = async (customType: 'skill' | 'agent', customId: string) => {
    if (!confirm(`Force-uninstall ${customType}:${customId}? This removes installed files and any guide entries referencing it.`)) return
    setBusy(`${customType}:${customId}`)
    setErr(null)
    try {
      await api.forceUninstallOrphan(customType, customId)
      refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const handleForceUninstallPatch = async (target: 'CLAUDE.md' | 'AGENTS.md') => {
    if (!confirm(`Force-uninstall patch tracker entry for ${target}? Master will be restored from .original and guide entries for this target cleared.`)) return
    setBusy(`patch:${target}`)
    setErr(null)
    try {
      await api.forceUninstallPatchOrphan(target)
      refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel">
      <h2>Orphans</h2>
      <p className="muted small">
        Customs recorded in the tracker but no longer present in the catalog (deleted, renamed, or
        reset after install).
      </p>
      {state.status === 'loading' ? <p className="muted">Loading…</p> : null}
      {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}
      {state.status === 'success' ? (
        state.data.orphans.length === 0 ? (
          <p className="muted">No orphans — tracker matches catalog.</p>
        ) : (
          <>
            {err ? <p className="error">{err}</p> : null}
            <ul className="orphans-list">
              {state.data.orphans.map((o) => {
                const key =
                  o.kind === 'patch'
                    ? `patch:${o.installedPaths[0] ?? ''}`
                    : `${o.customType}:${o.customId}`
                return (
                  <li key={key} className="orphans-item">
                    <div>
                      <strong>
                        {o.kind === 'patch' ? 'patch master' : `${o.customType}:${o.customId}`}
                      </strong>{' '}
                      {o.version ? <span className="muted small">v{o.version}</span> : null}
                      {o.tools.length > 0 ? (
                        <span className="muted small"> · tools: {o.tools.join(', ')}</span>
                      ) : null}
                      <div className="muted small">
                        {o.installedPaths.map((p) => (
                          <div key={p}>
                            <code>{p}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      className="button button-danger button-sm"
                      onClick={() => {
                        if (o.kind === 'patch') {
                          const target = o.installedPaths[0]?.endsWith('AGENTS.md')
                            ? ('AGENTS.md' as const)
                            : ('CLAUDE.md' as const)
                          void handleForceUninstallPatch(target)
                        } else if (o.customType === 'skill' || o.customType === 'agent') {
                          void handleForceUninstall(o.customType, o.customId)
                        }
                      }}
                      disabled={busy !== null}
                    >
                      {busy === key ? 'Removing…' : 'Force uninstall'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )
      ) : null}
    </section>
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
