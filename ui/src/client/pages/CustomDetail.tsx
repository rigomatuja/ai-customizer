import { Link, useParams } from 'react-router-dom'
import { CustomType } from '../../shared/schemas'
import { ErrorBadge } from '../components/ErrorBadge'
import { InstallControls } from '../components/InstallControls'
import { useCustomDetail } from '../hooks/useCustom'

export function CustomDetail() {
  const { type: typeParam, id } = useParams<{ type: string; id: string }>()
  const typeParse = CustomType.safeParse(typeParam)
  const effectiveType = typeParse.success ? typeParse.data : 'skill'
  const effectiveId = id ?? ''
  const state = useCustomDetail(effectiveType, effectiveId)

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
