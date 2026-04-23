import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CustomType } from '../../shared/schemas'
import type { ClaudeModelRegistry, OpencodeModelRegistry } from '../../shared/schemas'
import { api, ApiClientError } from '../api/client'
import { ErrorBadge } from '../components/ErrorBadge'
import { InstallControls } from '../components/InstallControls'
import { useAsyncWithRefetch } from '../hooks/useAsync'
import { useCustomDetail } from '../hooks/useCustom'

export function CustomDetail() {
  const { type: typeParam, id } = useParams<{ type: string; id: string }>()
  const typeParse = CustomType.safeParse(typeParam)
  const effectiveType = typeParse.success ? typeParse.data : 'skill'
  const effectiveId = id ?? ''
  const { state, refetch } = useCustomDetail(effectiveType, effectiveId)

  if (!typeParse.success || !id) {
    return (
      <main className="page">
        <section className="error-panel">
          <h1>Invalid route</h1>
          <p>Unknown custom type or missing id.</p>
          <Link to="/catalog">← Back to catalog</Link>
        </section>
      </main>
    )
  }

  if (state.status === 'loading') {
    return (
      <main className="page">
        <p className="muted">Loading custom…</p>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="page">
        <section className="error-panel">
          <h1>Could not load custom</h1>
          <p>{state.error.message}</p>
          <Link to="/catalog">← Back to catalog</Link>
        </section>
      </main>
    )
  }

  if (state.status !== 'success') return null
  const detail = state.data
  const m = detail.manifest

  return (
    <main className="page">
      <div className="breadcrumb">
        <Link to="/catalog">← Catalog</Link>
      </div>

      <header className="page-head">
        <h1>{m?.name ?? detail.id}</h1>
        <p className="muted">
          <code>
            {detail.type}:{detail.id}
          </code>
        </p>
        {m?.description ? <p className="subtitle">{m.description}</p> : null}
      </header>

      {detail.issues.length > 0 ? <ErrorBadge issues={detail.issues} /> : null}

      {m ? (
        <>
          <InstallControls
            customId={detail.id}
            customType={detail.type}
            supportedTools={detail.versions
              .find((v) => v.version === m.activeVersion)
              ?.files.map((f) => f.tool)
              .filter((t, i, a) => a.indexOf(t) === i) ?? []}
          />

          <section className="panel">
            <h2>Metadata</h2>
            <dl className="kv">
              <dt>Category</dt>
              <dd>{m.category}</dd>
              <dt>Scope</dt>
              <dd>{m.scope}</dd>
              {m.scope === 'project' && m.project ? (
                <>
                  <dt>Project</dt>
                  <dd>
                    <div>{m.project.name}</div>
                    {m.project.repoUrl ? (
                      <a href={m.project.repoUrl} target="_blank" rel="noreferrer">
                        {m.project.repoUrl}
                      </a>
                    ) : null}
                    {m.project.description ? <div className="muted">{m.project.description}</div> : null}
                  </dd>
                </>
              ) : null}
              <dt>Active version</dt>
              <dd>v{m.activeVersion}</dd>
              {m.type === 'patch' ? (
                <>
                  <dt>Target</dt>
                  <dd>{m.target}</dd>
                </>
              ) : null}
            </dl>
          </section>

          {m.type === 'agent' ? (
            <AgentModelPanel
              customId={detail.id}
              activeVersion={m.activeVersion}
              onChanged={refetch}
            />
          ) : null}

          {m.type !== 'patch' && m.hook ? (
            <section className="panel">
              <h2>Hook</h2>
              <dl className="kv">
                <dt>On fail</dt>
                <dd>{m.hook.onFail ?? 'halt (default)'}</dd>
                <dt>Triggers</dt>
                <dd>
                  <ul className="triggers-list">
                    {m.hook.triggers.map((t, i) => (
                      <li key={i}>
                        <span className="trigger-type">{t.type}</span>
                        <code>{t.target}</code>
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>
            </section>
          ) : null}

          {m.dependencies ? (
            <section className="panel">
              <h2>Dependencies</h2>
              <dl className="kv">
                {m.dependencies.gentleAi ? (
                  <>
                    <dt>gentle-ai</dt>
                    <dd>
                      required: {String(m.dependencies.gentleAi.required)}
                      {m.dependencies.gentleAi.minVersion
                        ? ` (min: ${m.dependencies.gentleAi.minVersion})`
                        : null}
                    </dd>
                  </>
                ) : null}
                {m.dependencies.customs && m.dependencies.customs.length > 0 ? (
                  <>
                    <dt>customs</dt>
                    <dd>
                      <ul>
                        {m.dependencies.customs.map((d) => (
                          <li key={d}>
                            <code>{d}</code>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}

          <section className="panel">
            <h2>Versions</h2>
            <ol className="versions-list">
              {detail.versions
                .slice()
                .reverse()
                .map((v) => (
                  <li key={v.version} className={v.version === m.activeVersion ? 'version-active' : ''}>
                    <header>
                      <strong>v{v.version}</strong>
                      {v.version === m.activeVersion ? <span className="badge badge-active">active</span> : null}
                      <span className="muted">{v.createdAt}</span>
                    </header>
                    {v.changelog ? <p>{v.changelog}</p> : <p className="muted">(no changelog)</p>}
                    {v.files.length > 0 ? (
                      <ul className="files-list">
                        {v.files.map((f) => (
                          <li key={`${f.tool}-${f.relativePath}`}>
                            <code>
                              [{f.tool}] {f.relativePath}
                            </code>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
            </ol>
          </section>
        </>
      ) : (
        <section className="panel error-panel">
          <h2>Manifest unavailable</h2>
          <p>This custom's manifest could not be parsed. See issues above.</p>
        </section>
      )}
    </main>
  )
}

// -----------------------------------------------------------------------
// Agent-only: change the `model:` field in the subagent/primary body.
// Patch-bumps the version. This is the ONE UI-driven write into
// customizations/** content — see docs/llm.md for the rationale.
// -----------------------------------------------------------------------

interface AgentModelPanelProps {
  customId: string
  activeVersion: string
  onChanged: () => void
}

const DO_NOT_CHANGE = '__unchanged__'
const INHERIT = '__inherit__'

function AgentModelPanel({ customId, activeVersion, onChanged }: AgentModelPanelProps) {
  const claudeReg = useAsyncWithRefetch(() => api.claudeModels(), [])
  const opencodeReg = useAsyncWithRefetch(() => api.opencodeModels(), [])

  const [claudeChoice, setClaudeChoice] = useState<string>(DO_NOT_CHANGE)
  const [opencodeChoice, setOpencodeChoice] = useState<string>(DO_NOT_CHANGE)
  const [note, setNote] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setInfo(null)
    const body: {
      claude?: string | null
      opencode?: string | null
      changelogNote?: string
    } = {}
    if (claudeChoice !== DO_NOT_CHANGE) {
      body.claude = claudeChoice === INHERIT ? null : claudeChoice
    }
    if (opencodeChoice !== DO_NOT_CHANGE) {
      body.opencode = opencodeChoice === INHERIT ? null : opencodeChoice
    }
    if (body.claude === undefined && body.opencode === undefined) {
      setError('Pick at least one change (claude or opencode).')
      setSaving(false)
      return
    }
    if (note.trim()) body.changelogNote = note.trim()
    try {
      const result = await api.changeAgentModel(customId, body)
      setInfo(`Patched v${result.fromVersion} → v${result.toVersion}. activeVersion bumped.`)
      setClaudeChoice(DO_NOT_CHANGE)
      setOpencodeChoice(DO_NOT_CHANGE)
      setNote('')
      onChanged()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <h2>Model assignment</h2>
      <p className="muted small">
        Changing a model creates a patch-bump of <code>v{activeVersion}</code>. Pick
        new values per tool, or leave <em>unchanged</em>. <code>inherit</code> removes
        the <code>model:</code> field entirely so the tool falls back to its default.
      </p>

      <div className="tool-detection-grid">
        <div className="tool-card">
          <div className="tool-card-head"><strong>Claude</strong></div>
          {claudeReg.state.status !== 'success' ? (
            <p className="muted small">Loading registry…</p>
          ) : (
            <ClaudeModelSelect
              registry={claudeReg.state.data.registry}
              value={claudeChoice}
              onChange={setClaudeChoice}
            />
          )}
        </div>

        <div className="tool-card">
          <div className="tool-card-head"><strong>Opencode</strong></div>
          {opencodeReg.state.status !== 'success' ? (
            <p className="muted small">Loading registry…</p>
          ) : (
            <OpencodeModelSelect
              registry={opencodeReg.state.data.registry}
              value={opencodeChoice}
              onChange={setOpencodeChoice}
            />
          )}
        </div>
      </div>

      <label className="tool-override">
        Changelog note (optional):{' '}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why this model change?"
          style={{ width: '100%', marginTop: '0.25rem' }}
        />
      </label>

      <div className="row">
        <button className="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save (patch-bump)'}
        </button>
      </div>
      {error ? <p className="error small">{error}</p> : null}
      {info ? <p className="muted small">{info}</p> : null}
    </section>
  )
}

function ClaudeModelSelect({
  registry,
  value,
  onChange,
}: {
  registry: ClaudeModelRegistry
  value: string
  onChange: (v: string) => void
}) {
  const aliases = Object.entries(registry.aliases)
  const versions = registry.knownVersions
  return (
    <select className="button-secondary" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={DO_NOT_CHANGE}>— leave unchanged —</option>
      <option value={INHERIT}>inherit (remove model field)</option>
      <optgroup label="Aliases (latest of tier)">
        {aliases.map(([alias, info]) => (
          <option key={alias} value={alias}>
            {alias} → {info.latest}
          </option>
        ))}
      </optgroup>
      <optgroup label="Pinned versions">
        {versions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

function OpencodeModelSelect({
  registry,
  value,
  onChange,
}: {
  registry: OpencodeModelRegistry
  value: string
  onChange: (v: string) => void
}) {
  const byProvider = new Map<string, typeof registry.models>()
  for (const m of registry.models) {
    const arr = byProvider.get(m.providerId) ?? []
    arr.push(m)
    byProvider.set(m.providerId, arr)
  }
  return (
    <select className="button-secondary" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={DO_NOT_CHANGE}>— leave unchanged —</option>
      <option value={INHERIT}>inherit (remove model field)</option>
      {registry.models.length === 0 ? (
        <option disabled>no models detected — refresh from Settings</option>
      ) : null}
      {[...byProvider.entries()].map(([provider, models]) => (
        <optgroup key={provider} label={provider}>
          {models.map((m) => (
            <option key={`${m.providerId}/${m.modelId}`} value={`${m.providerId}/${m.modelId}`}>
              {m.modelName ?? m.modelId}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
