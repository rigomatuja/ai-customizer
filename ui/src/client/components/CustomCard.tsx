import { Link } from 'react-router-dom'
import type { CustomSummary } from '../../shared/types'
import { ErrorBadge } from './ErrorBadge'

interface CustomCardProps {
  custom: CustomSummary
}

export function CustomCard({ custom }: CustomCardProps) {
  return (
    <article className={`card ${!custom.valid ? 'card-invalid' : ''}`}>
      <header className="card-head">
        <div className="card-title-row">
          <Link to={`/catalog/${custom.type}/${custom.id}`} className="card-title">
            {custom.name || custom.id}
          </Link>
          {!custom.valid ? <ErrorBadge issues={custom.issues} compact /> : null}
        </div>
        <code className="card-id">{custom.id}</code>
      </header>

      {custom.description ? <p className="card-description">{custom.description}</p> : null}

      <div className="card-tags">
        <span className={`tag tag-type tag-type-${custom.type}`}>{custom.type}</span>
        <span className={`tag tag-scope tag-scope-${custom.scope}`}>{custom.scope}</span>
        {custom.category ? <span className="tag tag-category">{custom.category}</span> : null}
        {custom.hasHook ? <span className="tag tag-hook">hook</span> : null}
        {custom.isPatch && custom.patchTarget ? (
          <span className="tag tag-target">target: {custom.patchTarget}</span>
        ) : null}
        {custom.tools.map((t) => (
          <span key={t} className={`tag tag-tool tag-tool-${t}`}>
            {t}
          </span>
        ))}
      </div>

      <footer className="card-foot">
        <span className="card-version">
          v{custom.activeVersion || '?'}{' '}
          <span className="muted">
            ({custom.versionCount} version{custom.versionCount !== 1 ? 's' : ''})
          </span>
        </span>
        {custom.project ? <span className="card-project">project: {custom.project.name}</span> : null}
      </footer>
    </article>
  )
}
