---
name: api-dev
description: API conventions for the AI Customizer — Hono routes, Zod schema-first validation, error contract via apiError, atomic JSON writes, per-key mutex for mutating endpoints, and client-side TypeScript sync. Load when editing any server route, shared schema, installer, or state module under ui/src/server/, ui/src/shared/, or ui/src/client/api/.
paths:
  - ui/src/server/**
  - ui/src/shared/**
  - ui/src/client/api/**
---

# API development

## When I'm loaded

Claude Code loads me automatically when you edit anything under
`ui/src/server/`, `ui/src/shared/`, or `ui/src/client/api/`. My job is
to keep the API consistent: same route layout, same validation model,
same error contract, same atomicity guarantees, same client-sync
discipline.

## Execution rule

Every new endpoint is a **4-step change done in the same turn**:
schema → route → mount → client. Don't split this across turns;
don't skip any step.

## Stack

- Hono on `@hono/node-server`. Single process, port 3236 by default.
- Zod 3.x for ALL request/response validation and file I/O validation.
- TypeScript types derived from Zod via `z.infer` — never hand-write a
  type that a schema could generate.
- No ORM, no database. State is JSON files under
  `~/.config/ai-customizer/` written atomically.

## File layout

```
ui/src/
├── shared/
│   ├── schemas.ts       # Zod — SINGLE SOURCE OF TRUTH
│   └── types.ts         # TS interfaces for response shapes + derived types
└── server/
    ├── index.ts         # Hono app bootstrap, route mounting, lock acquire
    ├── routes/          # one file per resource
    │   ├── <name>.ts    # exports <name>Routes: Hono
    │   └── _errors.ts   # apiError() helper
    ├── catalog/         # catalog loaders (pure, read-only)
    ├── state/           # user state read/write with atomic JSON writes
    ├── installer/       # planner, executor, patches, backup, orphans,
    │                    # manager-install, hook-registry, paths, fs-utils
    └── tools/           # Claude/Opencode detection, gentle-ai detection
```

## Adding an endpoint — 4 steps

1. **Schema** — add Zod for the request body (if any) in
   `ui/src/shared/schemas.ts`, plus a TS response interface in
   `ui/src/shared/types.ts` (types-only shapes that don't need runtime
   parsing).
2. **Route** — add the handler in `ui/src/server/routes/<name>.ts`.
   Use `safeParse` on bodies and `apiError(message, code, details?)`
   on validation failures.
3. **Mount** — if the file is new, add
   `app.route('/api/<name>', <name>Routes)` in
   `ui/src/server/index.ts`.
4. **Client** — add the matching method to
   `ui/src/client/api/client.ts`. Name it camelCase
   (`api.createProject`, `api.deleteOrphan`).

Then: update `docs/llm.md` §8 API surface (the endpoint table) — the
llm-sync skill will fire on your changes to remind you.

## Request / response contract

```ts
// Request body parsing
let body: unknown
try {
  body = await c.req.json()
} catch {
  return c.json(apiError('invalid JSON body', 'bad-request'), 400)
}
const parsed = MySchema.safeParse(body)
if (!parsed.success) {
  return c.json(apiError('invalid input', 'validation-failed', parsed.error.issues), 400)
}
// parsed.data is now typed
```

Error shape (literal, never deviate):
`{ error: string, code?: string, details?: unknown }`.
Use the `apiError()` helper in `_errors.ts`.

HTTP status codes:
- `200` OK (GET, POST on an action, PUT).
- `201` Created (POST that creates a resource).
- `400` Validation failed or malformed body.
- `404` Not found.
- `409` Conflict — use for application-level refusals like
  `not-initialized`, `restore-impossible`, `has-installations`,
  project deletion blocked, etc.
- `500` Unexpected server error — avoid; prefer a specific `4xx` when
  the client can fix the cause.

## Naming

- **Paths**: kebab-case. `/api/apply/plan`, `/api/tools/gentle-ai`.
- **Resource roots**: plural noun. `/api/projects`, `/api/installations`.
- **Actions that don't fit REST**: verb path nested under the resource.
  `/api/manager/install`, `/api/apply`, `/api/state/init`.
- **Client methods**: camelCase verb+noun.
  `createProject`, `upsertInstallation`, `forceUninstallOrphan`.

## Atomicity

All JSON-file writes go through `writeJsonAtomic` in
`installer/fs-utils.ts` (tmp file + `fs.rename`). The one documented
exception is the patch composer writing to master files
(`installer/patches.ts`) — those use `fs.writeFile` directly and rely
on the pre-Apply tar.gz backup for rollback.

## Catalog-write surface (normally forbidden, narrowly opened)

By convention, the UI does NOT edit `customizations/**` content — the
manager agent is the single actor that authors customs. **The one
documented exception is `catalog/agent-model.ts::changeAgentModel`**,
invoked from `POST /api/customs/agent/:id/model`. It clones the active
version folder to `v<current+0.0.1>/`, surgically rewrites the `model:`
field in the per-tool agent body, and bumps `manifest.activeVersion`.
The manifest write is atomic; the per-tool body writes use
`fs.writeFile` directly (minor — wrapped in try/catch with cleanup
that removes the orphan folder on failure). If you add another
catalog-write endpoint in the future, document it here too and keep
the count of exceptions small.

Mutating endpoints that touch the tracker or application-guide MUST
wrap the read-modify-write cycle in the per-key mutex:

```ts
import { withTrackerLock } from '../state/tracker'
return withTrackerLock(catalogPath, async () => {
  const tracker = await readTracker(catalogPath)
  // ... modify tracker ...
  await writeTracker(tracker)
})
```

Mutex keys in use: `tracker:<catalogPath>` (via `withTrackerLock`) and
`guide:<catalogRoot>` (inside `catalog/guide.ts`). Don't invent new
keys unless you're adding a new per-resource lock, and document it
when you do.

## Side-effects boundary

Pure vs side-effecting separation:

- `installer/planner.ts::computePlan` is **pure** — same inputs
  produce the same plan. Unit-test-friendly. Do NOT sneak side effects
  in.
- `installer/executor.ts::executePlan` is the **only** place that
  writes the tool dirs + backups + tracker + history on Apply.
- `routes/*.ts` must not write state directly — they call installer
  or state modules.

## Rules

- **Never** add an endpoint without its client method.
- **Never** validate at the route level with ad-hoc checks — write a
  schema.
- **Never** return an unvalidated response shape. If it's public, type
  it in `shared/types.ts`.
- **Never** bypass `writeJsonAtomic` for JSON files the UI owns.
- **Never** skip the mutex when mutating tracker or guide. A previous
  attempt at a simplified mutex caused silent data loss under
  concurrent upserts.
- **Schema first**: if you need a new shape, start in `schemas.ts` and
  `types.ts`, then let types flow.

## Anti-patterns

- Adding a new ORM or database. State is flat JSON; keep it simple.
- Introducing middleware for cross-cutting concerns. The codebase is
  small — explicit is better.
- Using exotic HTTP verbs (PATCH with a custom body shape, etc.).
  Stay with GET / POST / PUT / DELETE.
- Returning HTTP 200 with an error payload. Use the right status code.
- Parsing request bodies "loosely" with casts. Zod or nothing.

## Verification after edit

1. `npm run typecheck` in `ui/` — TypeScript must be clean.
2. Start the UI (`npm run dev`) and exercise the new endpoint via the
   client path.
3. If you added a new code / error shape, document it under
   `docs/llm.md` §6.11 error code vocabulary.
4. The llm-sync skill will fire — follow its guidance to update §8
   API surface table.

## References

- Route examples:
  - `ui/src/server/routes/apply.ts` — GET-heavy pattern.
  - `ui/src/server/routes/state.ts` — CRUD + body validation + 409
    handling.
  - `ui/src/server/routes/manager.ts` — action endpoints.
- Schemas: `ui/src/shared/schemas.ts`.
- Types: `ui/src/shared/types.ts`.
- Client sync target: `ui/src/client/api/client.ts`.
- Error helper: `ui/src/server/routes/_errors.ts`.
- Sibling skill for the client side: `.claude/skills/ui-design/SKILL.md`.
