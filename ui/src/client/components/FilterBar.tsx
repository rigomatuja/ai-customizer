import type { CustomType, Scope, Tool } from '../../shared/schemas'

export interface Filters {
  search: string
  types: Set<CustomType>
  scopes: Set<Scope>
  tools: Set<Tool>
  category: string
  onlyHooks: boolean
  onlyInvalid: boolean
}

export const ALL_TYPES: CustomType[] = ['skill', 'agent', 'patch']
export const ALL_SCOPES: Scope[] = ['global', 'project']
export const ALL_TOOLS: Tool[] = ['claude', 'opencode']

export function createDefaultFilters(): Filters {
  return {
    search: '',
    types: new Set(ALL_TYPES),
    scopes: new Set(ALL_SCOPES),
    tools: new Set(ALL_TOOLS),
    category: '',
    onlyHooks: false,
    onlyInvalid: false,
  }
}

interface FilterBarProps {
  filters: Filters
  categories: string[]
  onChange: (next: Filters) => void
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function FilterBar({ filters, categories, onChange }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <input
        type="search"
        placeholder="Search by name, id, or description…"
        className="filter-search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />

      <div className="filter-group">
        <span className="filter-label">Type</span>
        {ALL_TYPES.map((t) => (
          <label key={t} className="filter-chip">
            <input
              type="checkbox"
              checked={filters.types.has(t)}
              onChange={() => onChange({ ...filters, types: toggle(filters.types, t) })}
            />
            {t}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-label">Scope</span>
        {ALL_SCOPES.map((s) => (
          <label key={s} className="filter-chip">
            <input
              type="checkbox"
              checked={filters.scopes.has(s)}
              onChange={() => onChange({ ...filters, scopes: toggle(filters.scopes, s) })}
            />
            {s}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <span className="filter-label">Tool</span>
        {ALL_TOOLS.map((t) => (
          <label key={t} className="filter-chip">
            <input
              type="checkbox"
              checked={filters.tools.has(t)}
              onChange={() => onChange({ ...filters, tools: toggle(filters.tools, t) })}
            />
            {t}
          </label>
        ))}
      </div>

      <div className="filter-group">
        <label className="filter-chip">
          <input
            type="checkbox"
            checked={filters.onlyHooks}
            onChange={(e) => onChange({ ...filters, onlyHooks: e.target.checked })}
          />
          Only hooks
        </label>
        <label className="filter-chip">
          <input
            type="checkbox"
            checked={filters.onlyInvalid}
            onChange={(e) => onChange({ ...filters, onlyInvalid: e.target.checked })}
          />
          Only invalid
        </label>
      </div>

      {categories.length > 0 ? (
        <div className="filter-group">
          <span className="filter-label">Category</span>
          <select
            value={filters.category}
            onChange={(e) => onChange({ ...filters, category: e.target.value })}
          >
            <option value="">— all —</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  )
}
