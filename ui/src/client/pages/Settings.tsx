import { useState } from 'react'
import { api, ApiClientError } from '../api/client'
import type { Tool } from '../../shared/schemas'
import type { ClaudeModelRegistry, OpencodeModelRegistry } from '../../shared/schemas'
import type {
  AppStateResponse,
  CatalogPathBrowseResponse,
  CatalogPathValidateResponse,
  GentleAiDetection,
  GentleAiMasterScan,
  ProjectsResponse,
  ToolDetection,
} from '../../shared/types'
import { useAsyncWithRefetch, type AsyncState } from '../hooks/useAsync'
import { useAppState, useProjects, useTools } from '../hooks/useAppState'

export function Settings({ onCatalogRelinked }: { onCatalogRelinked: () => void }) {
  const { state: stateResult, refetch: refetchState } = useAppState()
  const toolsState = useTools()
  const { state: projectsResult, refetch: refetchProjects } = useProjects()

  return (
    <main className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="subtitle">Configuration + tool detection + known projects.</p>
      </header>

      <CatalogPathPanel state={stateResult} onSaved={onCatalogRelinked} />
      <ManagerPanel />
      <ToolsPanel tools={toolsState} state={stateResult} onSaved={refetchState} />
      <GentleAiPanel />
      <ModelsPanel />
      <ProjectsPanel projects={projectsResult} onChanged={refetchProjects} />
      <OrphansPanel />
    </main>
  )
}

function GentleAiPanel() {
  const { state } = useAsyncWithRefetch(() => api.gentleAi(), [])

  return (
    <section className="panel">
      <h2>Gentle AI integration</h2>
      {state.status === 'loading' ? <p className="muted">Detecting…</p> : null}
      {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}
      {state.status === 'success' ? <GentleAiContent data={state.data} /> : null}
    </section>
  )
}

function GentleAiContent({ data }: { data: GentleAiDetection }) {
  const scanRow = (label: string, scan: GentleAiMasterScan) => (
    <div className="tool-card">
      <div className="tool-card-head">
        <strong>{label}</strong>
        <span
          className={`badge badge-${!scan.masterExists ? 'error' : scan.tags.length > 0 ? 'ok' : 'warn'}`}
        >
          {!scan.masterExists ? 'master missing' : scan.tags.length > 0 ? `${scan.tags.length} tag(s)` : 'no tags'}
        </span>
      </div>
      <dl className="kv compact">
        <dt>Master</dt>
        <dd><code>{scan.masterPath}</code></dd>
        <dt>Tags</dt>
        <dd>
          {scan.tags.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            <div className="tag-row">
              {scan.tags.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          )}
        </dd>
      </dl>
    </div>
  )

  return (
    <>
      <p className={data.installed ? 'muted' : 'muted small'}>
        {data.installed ? (
          <>
            Detected <strong>{data.tags.length}</strong> gentle-ai marker tag
            {data.tags.length === 1 ? '' : 's'} across the master files.
            The manager can reference gentle-ai agents and skills when authoring customs.
          </>
        ) : (
          <>
            No <code>&lt;!-- gentle-ai:* --&gt;</code> markers found in <code>CLAUDE.md</code> or <code>AGENTS.md</code>.
            Install gentle-ai first if you want its agents/skills available as dependencies.
          </>
        )}
      </p>
      <div className="tool-detection-grid">
        {scanRow('Claude', data.claude)}
        {scanRow('Opencode', data.opencode)}
      </div>
    </>
  )
}

function ModelsPanel() {
  const claude = useAsyncWithRefetch(() => api.claudeModels(), [])
  const opencode = useAsyncWithRefetch(() => api.opencodeModels(), [])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshInfo, setRefreshInfo] = useState<string | null>(null)

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    setRefreshInfo(null)
    try {
      const result = await api.refreshOpencodeModels()
      opencode.refetch()
      const notes: string[] = []
      if (!result.sourcePaths.cacheFound) {
        notes.push(`cache file missing at ${result.sourcePaths.cachePath} — run "opencode models" first`)
      }
      if (!result.sourcePaths.authFound) {
        notes.push('no auth.json found — only env-var-authenticated providers will surface')
      }
      notes.push(`detected ${result.registry.models.length} model(s) across ${result.availableProviders.length} provider(s)`)
      setRefreshInfo(notes.join('; '))
    } catch (err) {
      setRefreshError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section className="panel">
      <h2>Models</h2>
      <p className="muted small">
        Per-agent model assignment reads from these two registries. Claude is static and
        catalog-side (edit the JSON directly); Opencode is detected from your local install
        and refreshable.
      </p>

      <div className="tool-detection-grid">
        <div className="tool-card">
          <div className="tool-card-head">
            <strong>Claude</strong>
            <span className="badge badge-ok">static registry</span>
          </div>
          {claude.state.status === 'loading' ? <p className="muted">Loading…</p> : null}
          {claude.state.status === 'error' ? <p className="error">{claude.state.error.message}</p> : null}
          {claude.state.status === 'success' ? <ClaudeModelsContent data={claude.state.data} /> : null}
        </div>

        <div className="tool-card">
          <div className="tool-card-head">
            <strong>Opencode</strong>
            <span className="badge badge-ok">detected</span>
          </div>
          {opencode.state.status === 'loading' ? <p className="muted">Loading…</p> : null}
          {opencode.state.status === 'error' ? <p className="error">{opencode.state.error.message}</p> : null}
          {opencode.state.status === 'success' ? (
            <OpencodeModelsContent registry={opencode.state.data.registry} />
          ) : null}
          <div className="row">
            <button className="button" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh from disk'}
            </button>
          </div>
          {refreshError ? <p className="error small">{refreshError}</p> : null}
          {refreshInfo ? <p className="muted small">{refreshInfo}</p> : null}
        </div>
      </div>
    </section>
  )
}

function ClaudeModelsContent({
  data,
}: {
  data: {
    registry: ClaudeModelRegistry
    filePath: string
    fileFound: boolean
    usingDefault: boolean
    parseError: string | null
  }
}) {
  return (
    <dl className="kv compact">
      <dt>File</dt>
      <dd>
        <code>{data.filePath}</code>
        {data.fileFound ? null : <span className="muted"> (missing — using defaults)</span>}
        {data.usingDefault && data.fileFound ? (
          <span className="muted"> (parse failed — using defaults)</span>
        ) : null}
      </dd>
      <dt>Aliases</dt>
      <dd>
        <div className="tag-row">
          {Object.entries(data.registry.aliases).map(([alias, info]) => (
            <span key={alias} className="tag">
              {alias} → {info.latest}
            </span>
          ))}
        </div>
      </dd>
      <dt>Known versions</dt>
      <dd>
        <div className="tag-row">
          {data.registry.knownVersions.map((v) => (
            <span key={v} className="tag">{v}</span>
          ))}
        </div>
      </dd>
      {data.parseError ? (
        <>
          <dt>Parse error</dt>
          <dd><span className="error small">{data.parseError}</span></dd>
        </>
      ) : null}
    </dl>
  )
}

function OpencodeModelsContent({ registry }: { registry: OpencodeModelRegistry }) {
  return (
    <dl className="kv compact">
      <dt>Detected at</dt>
      <dd>{registry.detectedAt ? <code>{registry.detectedAt}</code> : <span className="muted">never — click Refresh</span>}</dd>
      <dt>Models ({registry.models.length})</dt>
      <dd>
        {registry.models.length === 0 ? (
          <span className="muted">none</span>
        ) : (
          <div className="tag-row">
            {registry.models.map((m) => (
              <span key={`${m.providerId}/${m.modelId}`} className="tag">
                {m.providerId}/{m.modelId}
              </span>
            ))}
          </div>
        )}
      </dd>
    </dl>
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

function CatalogPathPanel({
  state,
  onSaved,
}: {
  state: AsyncState<AppStateResponse>
  onSaved: () => void
}) {
  const [draftPath, setDraftPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveInfo, setSaveInfo] = useState<string | null>(null)
  const [validation, setValidation] = useState<CatalogPathValidateResponse | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showBrowseModal, setShowBrowseModal] = useState(false)
  const [browse, setBrowse] = useState<CatalogPathBrowseResponse | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)

  const isLocked =
    state.status === 'success' && (state.data.catalogPathLockedByEnv || state.data.catalogPathSource === 'env')

  const loadBrowse = async (nextPath?: string) => {
    setBrowseLoading(true)
    setBrowseError(null)
    try {
      const data = await api.browseCatalogPath(nextPath)
      setBrowse(data)
    } catch (err) {
      setBrowseError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setBrowseLoading(false)
    }
  }

  const openBrowse = async () => {
    setShowBrowseModal(true)
    const seed = draftPath.trim() || (state.status === 'success' ? state.data.catalogPath : undefined)
    await loadBrowse(seed)
  }

  const handleRequestSave = async () => {
    setValidating(true)
    setSaveError(null)
    setSaveInfo(null)
    setValidation(null)
    try {
      const value = draftPath.trim()
      if (!value) {
        setSaveError('Introduce una ruta antes de guardar.')
        return
      }
      const result = await api.validateCatalogPath(value)
      setValidation(result)
      setShowConfirmModal(true)
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setValidating(false)
    }
  }

  const handleConfirmSave = async () => {
    if (!validation?.resolvedPath || validation.riskLevel === 'blocked') return
    setSaving(true)
    setSaveError(null)
    try {
      await api.updateCatalogPath(validation.resolvedPath)
      setSaveInfo('Ruta actualizada. No se ha lanzado Apply ni reinstalación automática.')
      setDraftPath('')
      setShowConfirmModal(false)
      setValidation(null)
      onSaved()
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <h2>Catalog</h2>
      {state.status === 'loading' ? (
        <p className="muted">Loading…</p>
      ) : state.status === 'error' ? (
        <p className="error">{state.error.message}</p>
      ) : state.status === 'success' ? (
        <>
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
          <dt>Path source</dt>
          <dd>
            <span className={`badge badge-${state.data.catalogPathSource === 'env' ? 'warn' : 'ok'}`}>
              {state.data.catalogPathSource}
            </span>
          </dd>
          {state.data.config ? (
            <>
              <dt>Initialized at</dt>
              <dd className="muted">{state.data.config.createdAt}</dd>
            </>
          ) : null}
          </dl>

        <div className="row">
          <input
            className="input"
            type="text"
            placeholder="Nueva ruta de catálogo (move/rename relink)"
            value={draftPath}
            onChange={(e) => setDraftPath(e.target.value)}
            disabled={isLocked || saving || validating}
          />
          <button className="button button-secondary" onClick={() => void openBrowse()} disabled={isLocked || saving || validating}>
            Seleccionar…
          </button>
          <button className="button" onClick={() => void handleRequestSave()} disabled={isLocked || saving || validating}>
            {validating ? 'Validando…' : saving ? 'Guardando…' : 'Guardar ruta'}
          </button>
        </div>
        {isLocked ? (
          <p className="muted small">
            Edición bloqueada: <code>CATALOG_PATH</code> tiene prioridad y no se puede sobrescribir desde la UI.
          </p>
        ) : null}
        {saveError ? <p className="error small">{saveError}</p> : null}
        {saveInfo ? <p className="muted small">{saveInfo}</p> : null}

        {showBrowseModal ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Selector de carpeta de catálogo">
            <div className="modal-card">
              <h3>Seleccionar carpeta</h3>
              {browseLoading ? <p className="muted">Cargando…</p> : null}
              {browseError ? <p className="error small">{browseError}</p> : null}
              {browse ? (
                <>
                  <p className="small"><code>{browse.path}</code></p>
                  <div className="row">
                    <button className="button button-secondary" disabled={!browse.parentPath || browseLoading} onClick={() => void loadBrowse(browse.parentPath ?? undefined)}>
                      Subir
                    </button>
                    <span className={`badge badge-${browse.isCatalogRoot ? 'ok' : 'warn'}`}>
                      {browse.isCatalogRoot ? 'catálogo válido' : 'sin marker de catálogo'}
                    </span>
                  </div>
                  {browse.warnings.length > 0 ? (
                    <ul className="catalog-path-list">
                      {browse.warnings.map((w) => (
                        <li key={`${w.code}-${w.message}`} className="small muted">Warning: {w.message}</li>
                      ))}
                    </ul>
                  ) : null}
                  <ul className="catalog-path-list">
                    {browse.directories.map((entry) => (
                      <li key={entry.path}>
                        <button className="button button-secondary" onClick={() => void loadBrowse(entry.path)}>
                          {entry.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="row">
                    <button className="button" disabled={!browse.isCatalogRoot} onClick={() => { setDraftPath(browse.path); setShowBrowseModal(false) }}>
                      Usar esta carpeta
                    </button>
                    <button className="button button-secondary" onClick={() => setShowBrowseModal(false)}>
                      Cerrar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {showConfirmModal && validation ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar relink de catálogo">
            <div className="modal-card">
              <h3>Confirmar cambio de ruta</h3>
              <p className="small">
                Ruta resuelta: <code>{validation.resolvedPath ?? '—'}</code>
              </p>
              <p className="small">
                Riesgo: <span className={`badge badge-${validation.riskLevel === 'blocked' ? 'error' : validation.riskLevel === 'medium' ? 'warn' : 'ok'}`}>{validation.riskLevel}</span>
              </p>
              <ul className="catalog-path-list">
                {validation.messages.map((m) => (
                  <li key={m.code} className={m.level === 'error' ? 'error small' : 'muted small'}>
                    {m.message}
                  </li>
                ))}
              </ul>
              <div className="row">
                <button className="button button-secondary" onClick={() => setShowConfirmModal(false)}>
                  Cancelar
                </button>
                <button className="button" onClick={() => void handleConfirmSave()} disabled={validation.riskLevel === 'blocked' || saving}>
                  {saving ? 'Guardando…' : 'Confirmar cambio'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </>
      ) : null}
      <p className="muted small">
        Recomendado para rename/move del MISMO catálogo. Evita cambiar la ruta durante Apply. Si apuntas a otro catálogo distinto,
        pueden aparecer orphans o blockers hasta reconciliar estado/instalaciones.
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
