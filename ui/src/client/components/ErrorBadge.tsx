import type { ValidationIssue } from '../../shared/types'

interface ErrorBadgeProps {
  issues: ValidationIssue[]
  compact?: boolean
}

export function ErrorBadge({ issues, compact }: ErrorBadgeProps) {
  if (issues.length === 0) return null

  const errorCount = issues.filter((i) => i.level === 'error').length
  const warnCount = issues.filter((i) => i.level === 'warning').length
  const title = issues.map((i) => `[${i.level}] ${i.code}: ${i.message}`).join('\n')

  if (compact) {
    return (
      <span className={`badge ${errorCount > 0 ? 'badge-error' : 'badge-warn'}`} title={title}>
        {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : `${warnCount} warn`}
      </span>
    )
  }

  return (
    <div className={`issues ${errorCount > 0 ? 'issues-error' : 'issues-warn'}`}>
      <strong>{errorCount > 0 ? 'Errors' : 'Warnings'}</strong>
      <ul>
        {issues.map((i, idx) => (
          <li key={idx}>
            <span className={`issue-level issue-level-${i.level}`}>{i.level}</span>
            <code>{i.code}</code>
            <span className="issue-message">{i.message}</span>
            {i.path ? <span className="issue-path">{i.path}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
