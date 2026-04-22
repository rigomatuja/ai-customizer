import { useMemo, useState } from 'react'
import { CustomCard } from '../components/CustomCard'
import { ErrorBadge } from '../components/ErrorBadge'
import {
  createDefaultFilters,
  FilterBar,
  type Filters,
} from '../components/FilterBar'
import { useCustomsList } from '../hooks/useCatalog'
import type { CustomSummary } from '../../shared/types'

function applyFilters(customs: CustomSummary[], f: Filters): CustomSummary[] {
  const q = f.search.trim().toLowerCase()
  return customs.filter((c) => {
    if (!f.types.has(c.type)) return false
    if (!f.scopes.has(c.scope)) return false
    if (f.onlyHooks && !c.hasHook) return false
    if (f.onlyInvalid && c.valid) return false
    if (f.category && c.category !== f.category) return false
    if (f.tools.size < 2) {
      const matches = c.tools.some((t) => f.tools.has(t))
      if (!matches && c.tools.length > 0) return false
    }
    if (q.length > 0) {
      const hay = `${c.id} ${c.name} ${c.description}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function CatalogBrowser() {
  const state = useCustomsList()
  const [filters, setFilters] = useState<Filters>(() => createDefaultFilters())

  const customs = state.status === 'success' ? state.data.customs : []
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const c of customs) if (c.category) set.add(c.category)
    return Array.from(set).sort()
  }, [customs])

  const filtered = useMemo(() => applyFilters(customs, filters), [customs, filters])

  return (
    <main className="page">
      <header className="page-head">
        <h1>Catalog</h1>
        <p className="subtitle">Browse and inspect customizations in your catalog.</p>
      </header>

      {state.status === 'loading' ? <p className="muted">Loading customs…</p> : null}

      {state.status === 'error' ? (
        <section className="error-panel">
          <h2>Could not load customs</h2>
          <p>{state.error.message}</p>
        </section>
      ) : null}

      {state.status === 'success' ? (
        <>
          <FilterBar filters={filters} categories={categories} onChange={setFilters} />

          <div className="results-count muted">
            {filtered.length} of {customs.length} custom{customs.length === 1 ? '' : 's'}
          </div>

          {filtered.length === 0 && customs.length === 0 ? (
            <div className="empty-state">
              <h3>No customs yet</h3>
              <p className="muted">
                Invoke the manager from Claude or Opencode to create your first custom (coming in M8).
                Meanwhile, you can hand-author a manifest in <code>customizations/</code> to see it appear here.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>No matches</h3>
              <p className="muted">Try adjusting your filters.</p>
            </div>
          ) : (
            <div className="card-grid">
              {filtered.map((c) => (
                <CustomCard key={`${c.type}:${c.id}`} custom={c} />
              ))}
            </div>
          )}

          {customs.some((c) => !c.valid) ? (
            <section className="panel">
              <h3>Invalid customs</h3>
              <ul className="invalid-list">
                {customs
                  .filter((c) => !c.valid)
                  .map((c) => (
                    <li key={`${c.type}:${c.id}`}>
                      <strong>
                        {c.type}:{c.id}
                      </strong>
                      <ErrorBadge issues={c.issues} />
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  )
}
