---
name: ui-design
description: UI conventions for the AI Customizer local web UI — React 19 / Vite / TypeScript, the page and panel patterns, CSS class naming, the async-hook pattern, and the existing component primitives. Load when editing any React component, hook, page, shared type used client-side, CSS, Vite config, or index.html under ui/.
paths:
  - ui/src/client/**
  - ui/src/shared/types.ts
  - ui/vite.config.ts
  - ui/index.html
  - ui/package.json
---

# UI design

## When I'm loaded

Claude Code loads me automatically when you edit anything under
`ui/src/client/`, `ui/src/shared/types.ts`, `ui/vite.config.ts`,
`ui/index.html`, or `ui/package.json`. My job is to keep the UI
consistent: same patterns, same CSS classes, same hook shapes, same
page structure.

## Execution rule

Before adding any new component, hook, page, or CSS class, check
whether an existing primitive already covers the need. Invent only when
you can't reuse. This skill lists the primitives and patterns you must
prefer.

## Stack (non-negotiable)

- **React 19**, **Vite 6**, **TypeScript 5.7**, **react-router-dom 7**.
- **No** global state manager. No Redux, no Zustand, no Jotai.
- **No** data-fetching library. No React Query, no SWR.
- **No** CSS-in-JS. No styled-components, no emotion, no Tailwind.
- **No** Sass / Less / PostCSS plugins. Plain CSS custom properties in
  a single `global.css`.

## File layout

```
ui/src/client/
├── main.tsx                  # entry + router
├── App.tsx                   # shell + wizard gating
├── api/client.ts             # typed fetch wrapper — ONE method per endpoint
├── hooks/                    # useAsync, useAsyncWithRefetch, useAppState, ...
├── pages/                    # one file per route
├── components/               # shared primitives (CustomCard, ErrorBadge, ...)
└── styles/global.css         # ALL styles live here
```

## Page pattern

```tsx
export function MyPage() {
  return (
    <main className="page">
      <header className="page-head">
        <h1>Title</h1>
        <p className="subtitle">One-line description.</p>
      </header>

      <MyPanel />
      <AnotherPanel />
    </main>
  )
}
```

Every page is a `<main className="page">`. Every panel inside is a
`<section className="panel">` with its own `<h2>`.

## Panel pattern

```tsx
function MyPanel() {
  const { state } = useAsyncWithRefetch(() => api.foo(), [])
  return (
    <section className="panel">
      <h2>Panel title</h2>
      {state.status === 'loading' ? <p className="muted">Loading…</p> : null}
      {state.status === 'error' ? <p className="error">{state.error.message}</p> : null}
      {state.status === 'success' ? <Content data={state.data} /> : null}
    </section>
  )
}
```

Every panel handles loading / error / success explicitly. No swallowed
errors. No global spinner.

## Async pattern

```ts
const { state, refetch } = useAsyncWithRefetch(() => api.something(), [])
// state.status: 'idle' | 'loading' | 'success' | 'error'
// state.data  (when 'success')
// state.error (when 'error')
```

Mutations wrap `useAsync` manually + call `refetch()` on success. No
React Query, no SWR.

## API client

`ui/src/client/api/client.ts` exposes a single `api` object. **Every**
backend endpoint has a matching method on it. When you add an endpoint
on the server, you MUST add its method here in the same turn. No
exceptions. This keeps the client type-safe against the server.

## CSS class naming

- **Kebab-case**: `tool-card`, `page-head`, `tag-row`.
- **Component-role** pattern for variants: `tool-card-head`,
  `tool-card-ok`, `badge-warn`, `badge-error`, `badge-ok`.
- **Utility classes**: `muted`, `small`, `error`, `row`, `subtitle`.
- **New classes**: add to `global.css`, grouped near the component
  they belong to. Reuse existing classes before inventing new ones.
- **CSS custom properties**: `--bg-elev-2`, `--fg-muted`, `--accent`,
  `--success`, `--warn`, `--danger`, `--border`. Use them for colors.
  Never hard-code hex inline in a component.

## Existing primitives — reuse before inventing

- `<dl className="kv compact">` + `<dt>` / `<dd>` — key-value tables.
- `<div className="tool-card tool-card-<status>">` + `.tool-card-head`
  — status card with colored header.
- `<span className="tag">label</span>` — pill. Variants:
  `.tag-type-skill`, `.tag-type-agent`, `.tag-type-patch`,
  `.tag-scope-project`, `.tag-hook`. `.tag-row` for flex-wrap container.
- `<span className="badge badge-{ok,warn,error}">` — inline status badge.
- `<button className="button">` primary, `.button-secondary`.
- `<p className="muted">`, `<p className="error">`, `<p className="small">`.

## Rules

- **Never** add a new CSS framework or preprocessor.
- **Never** introduce a global state manager for page-local state.
  If state legitimately needs to leak between pages, use React Context
  at the narrowest scope.
- **Never** bypass the `api` client with raw `fetch`. All server calls
  go through `api.*`.
- **Never** use inline styles for anything non-trivial. One-off width
  or display is fine; color, spacing, layout go in `global.css`.
- **Component files**: PascalCase, one primary export per file.
- **Router**: declare all routes in `main.tsx`.

## Anti-patterns

- A new CSS file per component. We have ONE global stylesheet.
- `useEffect(() => { fetch(...) })` — use `useAsync` /
  `useAsyncWithRefetch`.
- Copying a component to tweak it. Extend with a variant class or a
  prop.
- Adding a "theme toggle" or other chrome. This UI is dev-tool-grade;
  keep the surface small.
- Pulling in a component library (Radix, shadcn, MUI). Not today.

## Verification after edit

1. Run `npm run typecheck` in `ui/` — TypeScript must be clean.
2. Visually sanity-check the page you touched in the running UI.
3. Grep for new CSS classes you added: make sure the name matches the
   kebab-case + component-role convention.
4. If you added an endpoint, verify the `api.*` method exists.

## References

- Example panel: `ui/src/client/pages/Settings.tsx` — `ManagerPanel`,
  `ToolsPanel`, `GentleAiPanel`, `ProjectsPanel`, `OrphansPanel`.
- Example page + hooks: `ui/src/client/pages/CatalogBrowser.tsx` +
  `ui/src/client/hooks/useCatalog.ts`.
- Styles: `ui/src/client/styles/global.css`.
- Design spec: `docs/DESIGN.md`.
- Sibling skill for the server side: `.claude/skills/api-dev/SKILL.md`.
