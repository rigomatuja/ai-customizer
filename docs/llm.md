# AI Customizer — LLM context pack

This document is the single-file briefing for any AI coding agent that needs to
work on this repo. Read it end-to-end and you have everything required to
understand, modify, extend, release, or operate the project as if you had
built it yourself.

It complements — it does NOT replace — `README.md` (user-facing) and
`docs/DESIGN.md` (deep design spec). Cross-reference them when a specific
section points you there.

---

## Table of contents

0. [TL;DR for agents](#0-tldr-for-agents)
1. [Purpose and scope](#1-purpose-and-scope)
2. [Mental model — the three locations](#2-mental-model--the-three-locations)
3. [Stack, requirements, versions](#3-stack-requirements-versions)
4. [Repo layout (annotated)](#4-repo-layout-annotated)
5. [Core concepts (glossary + semantics)](#5-core-concepts-glossary--semantics)
6. [Invariants (non-negotiable rules)](#6-invariants-non-negotiable-rules)
7. [Flow deep-dives](#7-flow-deep-dives)
8. [API surface (all endpoints)](#8-api-surface-all-endpoints)
9. [Frontend surface](#9-frontend-surface)
10. [The manager agent](#10-the-manager-agent)
11. [State, concurrency, safety](#11-state-concurrency-safety)
12. [Release and versioning](#12-release-and-versioning)
13. [Scripts (install.sh, update.sh)](#13-scripts-installsh-updatesh)
14. [Environment variables](#14-environment-variables)
15. [Testing and local dev](#15-testing-and-local-dev)
16. [Conventions and rules](#16-conventions-and-rules)
17. [Claude vs Opencode (cheat sheet)](#17-claude-vs-opencode-cheat-sheet)
18. [Not in v1 (roadmap)](#18-not-in-v1-roadmap)
19. [Gotchas (things that will bite you)](#19-gotchas-things-that-will-bite-you)
20. [Quick navigation (where to edit what)](#20-quick-navigation-when-you-need-it)
21. [Where this document is out of date](#21-where-this-document-is-out-of-date)
22. [System skills (template-side)](#22-system-skills-template-side)

---

## Agent quick-start (read this before §0)

If you only have five minutes, here is the minimum viable mental model:

- **One repo = one catalog**. Clone is independent. State dir
  (`~/.config/ai-customizer/`) is **per machine, not per catalog**.
- **Three disk locations**: catalog (this repo) = authoring; state dir = UI
  bookkeeping; tool dirs (`~/.claude/`, `~/.config/opencode/`) = what
  Claude/Opencode actually read. See §2.
- **Schemas are the source of truth**: `ui/src/shared/schemas.ts` (Zod).
  Types are `z.infer`-derived. Edit schemas first, types follow.
- **Apply is atomic or it didn't happen**. Tracker is written in one atomic
  JSON write at the end. Failures roll back. Blockers make `executor.ts`
  return `result: 'rolled-back'` without touching anything.
- **Manager is special**: lives at `manager/` (not `customizations/`), is
  installed via `/api/manager/*`, and is explicitly excluded from the normal
  planner. Break this and the manager gets deleted on the next Apply.

**Where to edit what** (expanded in §20):

| Task | File |
|---|---|
| Add/change an API endpoint | `ui/src/server/routes/<name>.ts` + `ui/src/client/api/client.ts` |
| Add/change a schema or type | `ui/src/shared/schemas.ts` (types derive via `z.infer`) |
| Change Apply validation | `ui/src/server/installer/planner.ts` (warnings / blockers) |
| Change how a custom lands on disk | `ui/src/server/installer/paths.ts` |
| Change backups | `ui/src/server/installer/backup.ts` |
| Manager install semantics | `ui/src/server/installer/manager-install.ts` |
| Patch composition | `ui/src/server/installer/patches.ts` |
| Bump the version | `ui/package.json` + `ui/src/server/index.ts` + `README.md` status line |
| Reset local state for testing | stop UI, `rm -rf ~/.config/ai-customizer/`, restart |

---

## 0. TL;DR for agents

- **What this repo is**: a template repo + local web UI + "manager" AI agent
  for authoring, versioning, and atomically installing **customs** (skills,
  agents, patches) into **Claude Code** and **Opencode**.
- **Who runs it**: a single developer on their own machine, locally.
  No servers, no multi-user, no cloud, no telemetry.
- **Stack**: Node 20+, Hono (server), Vite + React 19 + TS (client), Zod
  (validation), `tar` (backups), `proper-lockfile` (single-instance lock).
- **Entry points**:
  - `./install.sh` — prereq checks, `npm install` in `ui/`, start dev server.
  - `./update.sh` — pull upstream template files without touching user content.
  - `cd ui && npm run dev` — Hono (`:3236`) + Vite (`:5256`) concurrently.
- **The big mental shift**: the repo IS the catalog. Every clone is an
  independent catalog. The UI and the manager agent both read/write this
  catalog, plus two separate disk locations (state dir, tool dirs).
- **Invariants you MUST preserve** — see §6. Violating them breaks atomicity
  or idempotence. Non-negotiable.

---

## 1. Purpose and scope

**Problem it solves.** Power users of Claude Code and Opencode want reusable,
git-versioned "customs" — skill files, agent files, patches to the master
`CLAUDE.md` / `AGENTS.md` — that can be installed/uninstalled atomically,
composed safely, and shared across machines via git. The tools themselves
give you raw file locations (`~/.claude/skills/<id>/SKILL.md` etc.) but no
authoring, versioning, conflict resolution, or rollback story.

**What v1 delivers.**
1. A **catalog** structure (this repo) where customs live versioned under
   `customizations/<type>/<id>/vX.Y.Z/<tool>/`, plus an `application-guide.json`
   that orders patch composition.
2. A **local web UI** to browse the catalog, toggle installs, run a planner
   (diff desired vs. on-disk state), see validation errors, and execute
   atomic Apply operations with backups + rollback.
3. A **manager agent** (shipped in `manager/`) that lives globally inside
   Claude/Opencode and knows how to create, improve, and version customs
   by writing the correct catalog files.
4. Two shell scripts (`install.sh`, `update.sh`) for setup and template
   sync.

**Out of scope for v1.** See §17 and `DESIGN.md` §12. Key omissions: multi-user,
Windows, project-scoped patches, a file watcher, profiles, import/export
bundles.

---

## 2. Mental model — the three locations

This is the single most important model to internalize. Everything else
follows from it.

```
CATALOG (this repo)                STATE (one per machine)              TOOLS (where they read)
─────────────────────              ─────────────────────                ─────────────────────
Authored truth.                    UI bookkeeping + safety net.         What Claude/Opencode
Version-controlled by git.         Per-machine, shared across all       actually read at runtime.
Each clone is independent.         catalogs on that machine.            Written ONLY by Apply.

<your-catalog>/                    ~/.config/ai-customizer/             ~/.claude/
  customizations/                    config.json                          skills/<id>/SKILL.md
    skills/<id>/...                  install-state.json (tracker)         agents/<id>.md
    agents/<id>/...                  history.json                         commands/<id>.md (Claude-only)
    patches/<id>/...                 hook-registry.json                   CLAUDE.md (+ .original)
  manager/<version>/...              projects.json
  application-guide.json             backups/*.tar.gz                   ~/.config/opencode/
  .ai-customizer/                    .lock                                skills/<id>/SKILL.md
    catalog.json                                                          agent/<id>.md
    triggers.json                                                         AGENTS.md (+ .original)
  ui/ (the web UI itself)

                                 <project>/
                                   .claude/skills/<id>/...        (project-scoped installs)
                                   .opencode/skills/<id>/...
                                   .atl/hook-registry.json        (gentle-ai convention, not .ai-customizer/)
```

**Who writes what.**

| Writer          | Catalog                  | State dir                | Tool dirs |
|-----------------|--------------------------|--------------------------|-----------|
| Manager (agent) | YES (authors customs)    | no                       | no        |
| UI server       | toggles active flags + guide edits only | YES (full control) | YES (only on Apply) |
| UI client       | no                       | via UI server            | no        |
| Human           | anywhere                 | never (let the UI do it) | never (let Apply do it) |

**Asymmetries.** Claude tool dir uses `agents/` (plural); Opencode uses `agent/`
(singular). Claude has slash commands at `~/.claude/commands/`; Opencode has
none. The master patch targets are `CLAUDE.md` for Claude, `AGENTS.md` for
Opencode. The code handles these asymmetries explicitly — never paper over them.

---

## 3. Stack, requirements, versions

- **Node.js**: 20+ required, LTS 22 recommended. The installer script hard-fails
  below 20.
- **Package manager**: `npm`. `package-lock.json` is committed.
- **Language**: TypeScript 5.7, ES modules (`"type": "module"`).
- **Server**: `hono` + `@hono/node-server`. Single process, single port (3236
  by default, overridable via `PORT`).
- **Client**: React 19 + Vite 6 + `react-router-dom` 7. No global state
  manager — component-local state + thin async hooks (`useAsync`, etc.).
- **Validation**: `zod` 3.x. Every cross-boundary payload (API request/response,
  file I/O) is validated with a schema. See `ui/src/shared/schemas.ts`.
- **Archives**: `tar` 7.x for pre-Apply backups.
- **Concurrency primitives**: `proper-lockfile` for the single-instance UI lock;
  a per-key async mutex in `ui/src/server/util/mutex.ts` for tracker and guide
  serialization.
- **Platforms**: Linux + macOS. Windows is not supported (path + rename
  semantics; `tar` differences).

See `ui/package.json` for exact versions. Current release: **v1.4.0** (bumped in
`ui/package.json.version` and `ui/src/server/index.ts` `/api/health.version`).

---

## 4. Repo layout (annotated)

```
.
├── install.sh                       # prereq checks + npm install + dev server (foreground)
├── update.sh                        # selective checkout from upstream template; preserves user content
├── README.md                        # user-facing docs
├── LICENSE                          # TBD
├── .gitignore
├── application-guide.json           # factory default: empty targets { CLAUDE.md: [], AGENTS.md: [] }
├── .ai-customizer/                  # catalog metadata (template-owned)
│   ├── catalog.json                 # { schemaVersion, name, createdAt } — used as "is this a catalog root?" marker
│   ├── triggers.json                # the trigger vocabulary (editable from UI)
│   └── models/
│       └── claude.json              # static Claude model registry — aliases + known full-ID versions (user-editable; ships with sensible defaults)
├── customizations/                  # all user-authored customs live here
│   ├── skills/<id>/manifest.json
│   ├── skills/<id>/vX.Y.Z/{claude,opencode}/SKILL.md
│   ├── agents/<id>/manifest.json
│   ├── agents/<id>/vX.Y.Z/{claude,opencode}/<id>.md
│   └── patches/<id>/manifest.json
│       └── vX.Y.Z/{claude,opencode}/{before,after}.md
├── manager/                         # the manager agent (shipped with the template, NOT under customizations/)
│   ├── manifest.json                # { id: "manager", type: "agent", activeVersion }
│   └── v0.9.0/
│       ├── claude/manager.md        # Claude subagent
│       ├── claude/slash-command.md  # /manager slash command (Claude-only; v1.0.6+)
│       └── opencode/manager.md      # Opencode primary agent (YAML frontmatter)
├── docs/
│   ├── DESIGN.md                    # full design spec (schemas, decisions, roadmap)
│   └── llm.md                       # THIS FILE
├── .claude/skills/                  # system skills for Claude Code (auto-activated via `paths` frontmatter — see §22)
│   ├── readme-sync/SKILL.md
│   ├── llm-sync/SKILL.md
│   ├── ui-design/SKILL.md
│   ├── api-dev/SKILL.md
│   └── manager-sync/SKILL.md
├── .opencode/skills/                # mirrors of the above for Opencode (no `paths`; semantic-match only)
│   ├── readme-sync/SKILL.md
│   ├── llm-sync/SKILL.md
│   ├── ui-design/SKILL.md
│   ├── api-dev/SKILL.md
│   └── manager-sync/SKILL.md
└── ui/                              # the local web UI (Hono + Vite + React)
    ├── package.json                 # version lives here and must be bumped on release
    ├── vite.config.ts               # strictPort: true on 5256; proxies /api to 127.0.0.1:3236
    ├── index.html
    └── src/
        ├── shared/                  # types + schemas imported by BOTH server and client
        │   ├── schemas.ts           # zod schemas — single source of truth
        │   └── types.ts             # TS types derived from schemas
        ├── server/
        │   ├── index.ts             # Hono app bootstrap, route mounting, lock acquire, catalog warn
        │   ├── logging.ts           # human or JSON logs (AIC_LOG_JSON=1)
        │   ├── catalog/
        │   │   ├── paths.ts         # getCatalogPath() — env var or parent of ui/
        │   │   ├── loader.ts        # reads customizations/ into typed catalog overview
        │   │   ├── guide.ts         # application-guide.json read/write + validation
        │   │   └── triggers.ts      # .ai-customizer/triggers.json read/write + wildcard matching
        │   ├── state/
        │   │   ├── paths.ts         # AIC_USER_CONFIG_DIR or ~/.config/ai-customizer/
        │   │   ├── config.ts        # config.json create + migrate + ensureUserConfigDir()
        │   │   ├── lock.ts          # proper-lockfile .lock acquire with PID
        │   │   ├── tracker.ts       # install-state.json read/write, per-catalog mutex, atomic write
        │   │   ├── history.ts       # history.json append-only
        │   │   ├── projects.ts      # projects.json CRUD
        │   │   └── installations.ts # installations.json CRUD — UI's "desired state"
        │   ├── installer/
        │   │   ├── paths.ts         # destination path resolver (tool × scope × id → InstallAsset[]); returns 2 assets for Claude agents with an optional slash-command companion, 1 otherwise
        │   │   ├── fs-utils.ts      # copyFile, hashFile, writeJsonAtomic (tmp + rename), deleteFileAndCleanup, pickCleanupBoundary
        │   │   ├── backup.ts        # tar.gz of tool dirs + project dirs; FIFO 10
        │   │   ├── planner.ts       # diff desired vs tracker vs fs → Plan with ops + warnings + blockers
        │   │   ├── executor.ts      # execute Plan atomically, with rollback on failure
        │   │   ├── patches.ts       # idempotent patch composition from .original; dry-run; restore
        │   │   ├── hook-registry.ts # regenerates global + per-project hook-registry.json
        │   │   ├── orphans.ts       # orphan detection + force uninstall (skill/agent + patch master)
        │   │   └── manager-install.ts # manager install/uninstall, 2-asset (Claude) or 1-asset (Opencode)
        │   ├── routes/
        │   │   ├── _errors.ts       # standard ApiError → HTTP status mapping
        │   │   ├── catalog.ts       # GET /api/catalog
        │   │   ├── customs.ts       # GET /api/customs, /api/customs/:type/:id
        │   │   ├── state.ts         # /api/state (config, init, tools-override), /api/state/projects/*
        │   │   ├── tools.ts         # GET /api/tools (detection + effective state)
        │   │   ├── installations.ts # /api/installations (upsert, remove)
        │   │   ├── apply.ts         # /api/apply/plan, /api/apply, /api/apply/history, /api/apply/tracker
        │   │   ├── guide.ts         # /api/guide + entry CRUD + reorder
        │   │   ├── triggers.ts      # /api/triggers + /api/hook-registry
        │   │   ├── manager.ts       # /api/manager, /api/manager/install, /api/manager/uninstall
        │   │   └── orphans.ts       # GET /api/orphans + DELETE force-uninstall
        │   ├── tools/
        │   │   └── detection.ts     # detect claude/opencode on PATH + config dirs
        │   └── util/
        │       └── mutex.ts         # per-key async mutex (promise chain)
        └── client/
            ├── main.tsx             # entry + router
            ├── App.tsx              # shell + wizard gating
            ├── api/client.ts        # typed fetch wrapper → all API endpoints
            ├── hooks/               # useAsync, useAppState, useCatalog, useCustom, useInstall, useGuide
            ├── pages/               # Welcome, Home, CatalogBrowser, CustomDetail, Apply, History,
            │                        # ApplicationGuide, Triggers, Settings
            ├── components/          # CustomCard, FilterBar, InstallControls, ErrorBadge, Layout
            └── styles/              # CSS
```

**Key invariant of the layout**: the catalog schema (`customizations/**`,
`application-guide.json`, `.ai-customizer/**`) is owned by the USER. The UI
and manager must never silently rewrite it except through narrow,
well-defined API endpoints. See §6.

---

## 5. Core concepts (glossary + semantics)

**Custom**. A unit of customization. Exactly one of three types: `skill`,
`agent`, `patch`. Stored under `customizations/<type>/<id>/`. Has a
`manifest.json` + one or more `vX.Y.Z/` version folders.

**Two type enums, distinct**. Don't confuse them:
- **`CustomType = 'skill' | 'agent' | 'patch'`** — every custom is one of these.
  Used in catalog listings and manifests.
- **`InstallableType = 'skill' | 'agent'`** — the subset of customs that go
  through `InstallationEntry` / `TrackerOp`. **Patches are NOT Installable**.
  Patches are managed separately through the Application Guide and
  `PatchTrackerOp` entries. This distinction is load-bearing in the planner.

**Custom id regex**. `^[a-z0-9][a-z0-9-_]*$` — lowercase alphanumeric plus
`-` and `_`, starting with an alphanumeric. Enforced by
`CustomIdRegex` in schemas. The manager follows this when creating customs.

**Semver**. `^\d+\.\d+\.\d+(-[a-z0-9.]+)?$`. Prerelease suffixes allowed
(`1.0.0-beta.1`). Applies to `manifest.versions[].version`, `activeVersion`,
and version folder names (which prepend `v`).

**Manifest**. `manifest.json` at `customizations/<type>/<id>/manifest.json`.
Declares id, name, description, type, category, scope (`global` or `project`),
the list of versions with createdAt/changelog, the `activeVersion`, and
type-specific fields (for patches: `target` ∈ `CLAUDE.md` | `AGENTS.md` |
`both`; for hooks-enabled: `hook: { triggers[], onFail }`). Schema:
`ManifestSchema` in `ui/src/shared/schemas.ts`.

**Version**. A semver-named folder under the custom. Contains per-tool content
(`claude/`, `opencode/`, or both). When `activeVersion` changes, Apply
uninstalls the old version's files and installs the new.

**Skill**. A markdown file (`SKILL.md`) loaded as context by the tool.
Installed to `~/.claude/skills/<id>/SKILL.md` or
`~/.config/opencode/skills/<id>/SKILL.md` (global) or project equivalents.

**Model registry**. Two independent registries used by the manager and
the UI's "change model" feature. Claude: static, catalog-side at
`.ai-customizer/models/claude.json` (aliases + known full-ID versions).
Opencode: detected, state-side at `~/.config/ai-customizer/opencode-models.json`,
refreshable from Settings. Both are read-only from the manager's
perspective — it NEVER invents IDs outside the relevant registry. See
§10.9 for the full protocol.

**Agent**. An invocable subagent (Claude) or primary/subagent (Opencode).
Installed to `~/.claude/agents/<id>.md` or `~/.config/opencode/agent/<id>.md`
(note the `agents/` vs `agent/` asymmetry). A Claude agent may ALSO ship
an optional slash-command companion file
(`customizations/agents/<id>/v<ver>/claude/slash-command.md`) that the
installer copies to `<claude>/commands/<id>.md`, enabling `/<id>`
invocation. Opencode has no equivalent — explicit invocation on that
side is achieved by setting `mode: primary` in the agent frontmatter so
it appears in the Tab selector. See §10.8.

**Patch**. Idempotent find-and-replace on a master file. `before.md` must be
an exact substring of the master; `after.md` replaces it. Targets: `CLAUDE.md`,
`AGENTS.md`, or both. Composes with other patches via the Application Guide.

**Application Guide**. `application-guide.json` in the catalog. Per master
target (`CLAUDE.md`, `AGENTS.md`), an ordered list of `{ patchId, version,
active, order }`. Defines which patches compose and in what order.

**Master file**. The composed destination: `~/.claude/CLAUDE.md` or
`~/.config/opencode/AGENTS.md`. Never hand-edited by the UI — only by
patch composition on Apply.

**`.original`**. Snapshot of the master file captured on the first patch
Apply. Every subsequent patch Apply composes starting from `.original`, never
from the live master. This is what makes patches idempotent and order-stable.
Never auto-deleted. Delete it manually to rebase onto a new baseline.

**Hook**. A custom (skill or agent) whose manifest declares `hook: { triggers,
onFail }`. On Apply, the UI regenerates `hook-registry.json` — global at
`~/.config/ai-customizer/hook-registry.json` and per-project at
`<project>/.atl/hook-registry.json` (note: `.atl/` is the gentle-ai
convention for agent-tooling metadata, not the catalog's own `.ai-customizer/`
directory). External orchestrators discover and fire hooks by reading these
registries. **The UI does not fire hooks** — it only publishes the registry.

**Trigger**. A string like `phase:sdd-pipeline:post-design` or
`agent-event:*:complete`. Vocabulary lives in `.ai-customizer/triggers.json`.
Wildcards supported via `isKnownTrigger` in `catalog/triggers.ts`: `*` is
expanded to the regex `[^:]+` — it matches exactly one path segment with no
colons. So `agent-event:*:complete` matches `agent-event:sdd-apply:complete`
but not `agent-event:a:b:complete`. Unknown triggers in a manifest produce a
planner WARNING, not a blocker.

**Project**. A registered local path. Stored in `projects.json`. Install
entries can target `scope: "project", projectId: "<uuid>"` instead of global.

**Install entry**. Row in `installations.json`:
`{ customType: InstallableType, customId, target: TargetScope, tools: Tool[] }`.
This is the UI's **desired state** — what the user has toggled on. The
planner diffs it against the tracker and filesystem to produce ops. Patches
do NOT appear here; their desired state lives in the Application Guide.

**Tracker**. `~/.config/ai-customizer/install-state.json`. The **actual state**
— every file the UI has put on disk with content hash, version, tool, scope,
project. Written atomically (tmp + rename) after each Apply succeeds. Two
arrays inside:
- `operations: TrackerOp[]` — skill/agent installs. `TrackerOp.type` is
  `'copy' | 'json-merge'` (`json-merge` is reserved for future JSON-fragment
  merges; the current installer only emits `copy`).
- `patches: PatchTrackerOp[]` — one per touched master (`CLAUDE.md`,
  `AGENTS.md`) with `activeGuideHash` + `appliedContentHash` for drift
  detection.

**Dependencies**. Optional `manifest.dependencies`: either
`gentleAi: { required, minVersion? }` (external version gate) and/or
`customs: string[]` where each entry is formatted as `"skill:my-id"` or
`"agent:other-id"`. Only skill/agent manifests can declare them — patches
can't. The planner walks this graph on every Plan for closure + cycle checks
(§6.8). Dependency errors are **blockers**, not warnings.

**Gentle-ai detection**. A lightweight tag scan of the master files
(`~/.claude/CLAUDE.md`, `~/.config/opencode/AGENTS.md`) looking for HTML
comments of the form `<!-- gentle-ai:<tag> -->` where `<tag>` is
alphanumeric + `_` + `-`. Any match = gentle-ai is considered installed.
The server exposes `GET /api/tools/gentle-ai` for UI display, and the
manager agent is expected to run the same scan via its Read tool when
authoring customs so it can offer gentle-ai skills/agents as dependencies
and auto-fill `dependencies.gentleAi` in manifests. The detector lives
in `ui/src/server/tools/gentle-ai.ts` and is the canonical reference for
the regex.

**History**. `history.json`. Append-only audit log: one entry per Apply with
counts, duration, result (`success` / `rolled-back` / `blocked` /
`partial-failure`), backup path.

**Backup**. `backups/apply-YYYYMMDD-HHMMSS.tar.gz`. Created before every Apply,
captures affected tool dirs + project dirs. FIFO, last 10 kept. Used for patch
rollback and manual disaster recovery.

**Orphan**. A custom that exists in the tracker (installed files on disk) but
no longer in the catalog. Two kinds (see `OrphanKind = 'skill-or-agent' | 'patch'`
in `installer/orphans.ts`):
- **Skill/agent orphan**: custom folder deleted from `customizations/`. Files
  stay on disk until Force uninstall. Force uninstall is **partial-failure
  tolerant**: if some deletes fail (permissions, etc.), tracker ops are
  dropped only for the successful ones — returns `failedPaths[]` so the
  user can retry.
- **Patch master orphan**: the guide references patches no longer in the
  catalog. Restore requires `.original`. If `.original` is missing, returns
  409 `restore-impossible` and requires `?force=1`.
- **Caveat — conservative patch detection.** `/api/orphans` only flags a
  patch orphan when the catalog has ZERO patches at all. If the catalog
  contains SOME patches but the tracker references a specific deleted
  `patchId`, the planner blocks the plan (`patch-dry-run-failed` / similar)
  but the orphan endpoint stays silent. Fix the guide by hand or re-add the
  missing patch to the catalog.

**Drift**. Tracker says a file has hash X; current file has hash Y.
- `drift-modified` — file was edited since install.
- `drift-missing` — file was deleted since install.
Both are **non-blocking warnings** shown in the plan. Next Apply
overwrites (modified) or re-installs (missing).

**Manager**. The special agent at `manager/`. Not under `customizations/` —
factory-protected. Installed globally with atomic 2-asset (Claude) or
1-asset (Opencode) install. Separate tracker entries (`customType: agent`,
`customId: manager`) that the regular planner explicitly EXCLUDES from its
diff (§6.6).

---

## 6. Invariants (non-negotiable rules)

These are load-bearing. If you change code that touches any of them, make
sure the invariant still holds.

### 6.1 Apply is atomic-with-rollback

An Apply either (a) succeeds and leaves tracker + filesystem consistent,
(b) rolls back executed operations in reverse on mid-flight failure and
restores from tar.gz if patches were involved, or (c) hard-blocks before
touching anything when the plan has blockers. Tracker is only written at
the very end, in a single atomic JSON write (tmp + rename).

### 6.2 Atomic JSON writes

Every JSON file the UI owns (`config.json`, `installations.json`, tracker,
history, hook-registry, projects, application-guide, triggers) is written
via tmp-file + `fs.rename`. Never `fs.writeFile` directly on the destination.
See `ui/src/server/installer/fs-utils.ts::writeJsonAtomic`.

**Exception: patch composition writes are NOT atomic.** The master file
write in `executePatchApply` (`installer/patches.ts`) uses
`fs.writeFile(masterPath, ...)` directly — a crash mid-write can leave a
truncated master. Safety net: the pre-Apply tar.gz backup captures the
master's pre-Apply state, and executor restores from it on any patch-apply
failure. Do NOT assume "all writes are atomic" when refactoring — only
the JSON writes are.

### 6.3 Patch idempotence — always compose from `.original`

On every patch Apply, the composer reads `<master>.original` (creating it on
first use by snapshotting the current master), then applies the ordered
active patches on top, then writes the composed result atomically. NEVER
compose from the live master — you'd compound applications and silently
corrupt on re-run.

### 6.4 Per-key async mutex for tracker and guide

Concurrent writes to the tracker or application-guide are serialized via
`withLock(key, fn)` in `ui/src/server/util/mutex.ts`. Two keys are used:
`tracker:<catalogPath>` (wrapped by `withTrackerLock`) and
`guide:<catalogRoot>`. Installations, projects, and history are NOT
wrapped — they either serialize naturally (single caller at a time from
the UI) or the reads tolerate racy writes.

The mutex is a promise chain. Simplified:

```ts
const prev = locks.get(key) ?? Promise.resolve()
const mine = prev.then(fn, fn)               // run fn whether prev resolved or rejected
locks.set(key, mine.then(() => undefined, () => undefined))  // swallow errors in the tail
return await mine                            // caller still sees the original rejection
```

Do not simplify this without testing. An earlier attempt caused deadlocks
under concurrent upserts. The `.then(fn, fn)` (not `.finally(fn)`) and the
swallow-error tail are both load-bearing.

### 6.5 Single-instance UI lock

The server acquires `~/.config/ai-customizer/.lock` via `proper-lockfile` on
boot and dies if another UI is running. This prevents two UIs from racing on
the tracker/backups.

### 6.6 Manager is isolated from the normal planner

The planner's `trackerInstallsFor()` explicitly EXCLUDES
`customType === 'agent' && customId === 'manager'`. Manager state is managed
only through `/api/manager/install` and `/api/manager/uninstall`. A regular
Apply must never plan an uninstall of the manager. Historical bug:
forgetting this exclusion deleted the manager on the first regular Apply.

### 6.7 Catalog marker check

Every script/CLI interaction verifies `.ai-customizer/catalog.json` exists
as a sanity marker of "this is a catalog root". The install script and
update script both check this; the server logs a WARNING and keeps running
if the catalog path is invalid, but catalog routes will then 500.

### 6.8 Transitive dependency closure + cycle detection

The planner walks the dependency graph of every install, detects cycles, and
blocks the plan if any installed custom's transitive deps are missing or form
a cycle. Iterative DFS (explicit stack with the current path carried on each
node), not recursive (avoid stack blow-ups for pathological graphs). Only
skill/agent manifests can declare `dependencies.customs`; patches can't and
the walker skips them. Codes emitted: `dependency-missing-in-catalog`,
`dependency-not-active`, `dependency-cycle`.

### 6.9 Manager install is atomic across assets

Claude install = 2 assets (agent + slash command). Opencode install = 1 asset
(agent). A failure on the second Claude asset rolls back the first via
snapshotted prior content. Source and destination must not resolve to the
same real path (symlink misconfig guard).

### 6.10 Never commit user state

`customizations/**`, `application-guide.json`, `.ai-customizer/triggers.json`
and `.ai-customizer/catalog.json` are USER-owned. The update script
explicitly excludes them from upstream pull. The template ships factory
defaults (empty guide, sane trigger list, stock catalog.json) which the user
can overwrite freely.

### 6.11 Error code vocabulary

Warnings and blockers carry a stable `code: string` field. The canonical
list is the literal strings in `ui/src/server/installer/planner.ts`
(and `orphans.ts` for orphan-restore codes). Known codes at time of writing:

- **Blockers**: `dependency-missing-in-catalog`, `dependency-not-active`,
  `dependency-cycle`, `path-collision`, `patch-dry-run-failed`,
  `manifest-invalid`, `version-not-found`, `unknown-trigger-type` (when the
  type enum itself is wrong — rare).
- **Warnings**: `drift-modified`, `drift-missing`, `unknown-trigger` (target
  not in `triggers.json`), `inactive-hook-dependency`.
- **Orphan endpoints**: `restore-impossible` (409 when `.original` is
  missing, override with `?force=1`).

When adding a new code, grep for an adjacent one and follow the same
`code` + `message` pattern. The client shows `message` to the user and
uses `code` for special-case UI rendering (the "Force uninstall" button,
for example).

---

## 7. Flow deep-dives

### 7.1 Apply pipeline

Plan shape (see `ui/src/shared/types.ts`):

```ts
type PlanOperationKind = 'install' | 'upgrade' | 'uninstall'
type PhysicalOp =
  | { kind: 'copy';   from: string; to: string }
  | { kind: 'delete'; path: string }

interface Plan {
  operations: PlanOperation[]        // skill + agent ops
  patchOperations: PlanPatchOp[]     // patches, handled separately
  warnings: PlanWarning[]            // { code, message, customId? } — non-blocking
  blockers: PlanBlocker[]            // { code, message, customId? } — HARD FAIL
  backupWillBeCreated: boolean
  currentInstalledCount: number
}
```

Flow:

```
POST /api/apply
  → buildContext()        # loadCatalog + listInstallations + readTracker +
  →                       # listProjects + readGuide + readTriggers + loadAllManifests
  → plan = computePlan(context)     # pure function — same inputs, same plan
  → executePlan(plan, …)
      withTrackerLock(catalogPath):
        if plan.blockers.length > 0:
          return ApplyResponse{ result: 'rolled-back', error: "cannot apply: N blocker(s)",
                                backupPath: null, ...counts }  # no side effects, no backup, no history entry append beyond error
        if plan.operations.length == 0 and plan.patchOperations.length == 0:
          regenerateHookRegistries()   # still regenerate even on no-op Apply
          return ApplyResponse{ result: 'success', backupPath: null, ... }
        backupPath = createBackup(projectPaths)   # snapshots ~/.claude + ~/.config/opencode (if they exist)
                                                   # PLUS <project>/.claude + <project>/.opencode for each project.
                                                   # Always all of them — NOT filtered by what the plan touches.
                                                   # Returns null if zero targets exist (fresh install, no tool dirs yet).
        for op in plan.operations:
          for physical in op.physical:     # 'copy' | 'delete'
            execute physical
            if physical.kind == 'copy' and op.kind != 'uninstall':
              stage TrackerOp{ type:'copy', contentHash:sha256(…), … }
        for patchOp in plan.patchOperations:
          executePatchApply(patchOp)       # compose from .original
        on any error mid-flight:
          reverse executed physical ops (delete→restore from backup, copy→delete)
          if patches ran → restoreBackup(tarGz)
          result = 'rolled-back'
          if reversal itself failed → result = 'rollback-failed'
        tracker.operations = tracker.operations.filter(notTouched) + stagedOps
        writeTracker(tracker)   # single atomic JSON write
        regenerateHookRegistries(global + per-project)
        appendHistory({ result, counts, durationMs, backupPath, error })
        fifoRotateBackups(max=10)
  → return ApplyResponse
```

**`ApplyResult` values** (`ui/src/shared/schemas.ts`):
- `'success'` — plan ran clean.
- `'rolled-back'` — either blockers prevented execution, or a mid-flight
  failure was successfully reverted.
- `'rollback-failed'` — mid-flight failure AND the rollback itself failed.
  State is now inconsistent; user must restore manually from the backup
  tar.gz. Surfaces in the UI and history with the original error.

There is **no** `'blocked'` or `'partial-failure'` — the blocker case
collapses into `'rolled-back'` with an explanatory `error` string.

Every step above is pure-function friendly; side effects are isolated to
`executor`, `backup`, `tracker.write`, `history.append`. Unit-test the
planner (`computePlan`) and the composer (`composePatches` in `patches.ts`)
in isolation — they are the two pieces where bugs have production impact.

### 7.2 Patch composition (idempotent)

```
for target in [CLAUDE.md, AGENTS.md]:
  guide_entries = guide.targets[target].filter(active).sortBy(order)
  if guide_entries.empty && master.exists && .original.exists:
    # All patches removed → restore to baseline, keep .original
    writeAtomic(master, read(.original))
    continue
  if guide_entries.nonEmpty:
    if !.original.exists:
      copy(master, .original)    # first-ever patch snapshot
    composed = read(.original)
    for entry in guide_entries:
      before = read(customizations/patches/<entry.patchId>/v<entry.version>/<tool>/before.md)
      after  = read(...                                                          /after.md)
      if !composed.includes(before):
        → planner raises patch-dry-run-failed BEFORE we get here
      composed = composed.replace(before, after)   # one occurrence
    writeAtomic(master, composed)
    record tracker.patches entry with activeGuideHash + appliedContentHash
```

Key properties:
- Reorder patches → different composition → correct by design.
- Disable all patches → master restored to `.original`, no data loss.
- `.original` never auto-deleted → composition is stable across toggles.

### 7.3 Install/uninstall for skill/agent

On toggle-on from the UI, an `InstallationEntry` is upserted in
`installations.json`. **Upsert key is `(customId, customType)` — nothing
else.** Target and tools are overwritten on re-upsert, which is why v1
doesn't support one custom installed in multiple targets at once (see §18).

The next Apply plans `install` ops (or `upgrade` if the tracker already has
a different version for that id/tool/scope). On toggle-off, the entry is
removed; planner emits `uninstall` ops for every tracker entry matching
the id that no longer has a corresponding install entry. The executor
copies files in, computes `sha256` content hashes, and records each as a
`TrackerOp { type: 'copy', toPath, fromPath, contentHash, … }`.

**Uninstall directory cleanup.** `deleteFileAndCleanup(target, stopAt)`
unlinks the target, then walks up removing empty parent directories until
it hits a non-empty directory or `stopAt` (the home directory). So
uninstalling the only skill in `~/.claude/skills/foo/` removes both
`SKILL.md` and the now-empty `foo/` folder; it will NOT remove
`~/.claude/skills/` itself because the walker stops at the `stopAt`
boundary and at non-empty dirs.

### 7.4 Manager install (special path)

Not routed through the regular planner. Endpoint: `POST /api/manager/install`
with `{ tools: ['claude', 'opencode' ] }`. For each tool, `managerAssets`
returns 1 (opencode) or 2 (claude) `ManagerAsset { kind, src, dst }` entries.
All copies are staged, `previousSnapshot` captures pre-existing content for
rollback, and tracker is committed in a single atomic write AFTER all copies
succeed. See `ui/src/server/installer/manager-install.ts`.

Uninstall: reads tracker entries where `customType === 'agent' && customId ===
'manager'`, unlinks each `toPath`, clears them from the tracker, writes
atomically.

### 7.5 Orphan handling

GET `/api/orphans` returns two kinds:
- `skill-or-agent`: tracker references an id whose custom folder no longer
  exists under `customizations/`.
- `patch`: guide references patches missing from the catalog. `reason`
  explains.

Force-uninstall endpoints (`DELETE /api/orphans/:type/:id`,
`DELETE /api/orphans/patch/:target`) delete installed files, drop tracker
entries, remove affected guide entries, and for patch orphans attempt to
restore the master from `.original`. If `.original` is missing, returns
409 with `code: "restore-impossible"` unless `?force=1` is passed.

**Cleanup boundary**: after unlinking an orphan file, the walk-up that
removes empty parent directories now uses `pickCleanupBoundary` from
`fs-utils.ts` with `[home, ...projectPaths]`. Longest-match wins, so the
walk-up stops at the PROJECT root for project-scoped orphans (even when
the project sits outside `$HOME`). Before v1.4.0 this used `$HOME` only,
which left empty `<project>/.claude/skills/<id>/` dirs behind for
projects outside `$HOME`. Files were always deleted correctly — the fix
only affects the empty-directory cleanup tail.

---

## 8. API surface (all endpoints)

Base URL: `http://127.0.0.1:3236`. All responses are JSON. Error shape:
`{ error: string, code?: string, details?: unknown }`.

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/health`                          | liveness + version |
| GET    | `/api/catalog`                          | overview: customs grouped by type, counts, errors |
| GET    | `/api/customs`                          | flat list of customs |
| GET    | `/api/customs/:type/:id`                | detail + all versions + per-tool content existence |
| GET    | `/api/state`                            | config + projects + installations + tracker summary |
| POST   | `/api/state/init`                       | create state dir + config.json if absent |
| POST   | `/api/state/tools-override`             | override detected tools (`null` clears) |
| GET    | `/api/state/projects`                   | list registered projects |
| POST   | `/api/state/projects`                   | create project |
| PUT    | `/api/state/projects/:id`               | update project |
| DELETE | `/api/state/projects/:id[?force=1]`     | delete project (blocked if installations exist unless forced) |
| GET    | `/api/tools`                            | detection result + effective state (after override) |
| GET    | `/api/tools/gentle-ai`                  | scans `~/.claude/CLAUDE.md` and `~/.config/opencode/AGENTS.md` for `<!-- gentle-ai:* -->` markers; returns `GentleAiDetection` |
| GET    | `/api/tools/claude-models`              | returns the static Claude model registry (aliases + knownVersions) from `<catalog>/.ai-customizer/models/claude.json`, falling back to defaults |
| GET    | `/api/tools/opencode-models`            | returns the last cached Opencode detection from state dir |
| POST   | `/api/tools/opencode-models/refresh`    | re-runs detection (reads `~/.cache/opencode/models.json` + `~/.local/share/opencode/auth.json` + env), persists to state dir, returns fresh registry |
| POST   | `/api/customs/agent/:id/model`          | change the `model:` field on an agent's active version. Body `{ claude?: string\|null, opencode?: string\|null, changelogNote? }`. Patch-bumps the version. ONLY UI-driven write into `customizations/**` content |
| GET    | `/api/installations`                    | all install entries (desired state) |
| POST   | `/api/installations`                    | upsert install entry |
| DELETE | `/api/installations/:type/:id`          | remove install entry |
| GET    | `/api/apply/plan`                       | dry-run planner; returns Plan with ops + warnings + blockers |
| POST   | `/api/apply`                            | recompute plan server-side, execute it, return ApplyResponse (no request body) |
| GET    | `/api/apply/history`                    | full history |
| GET    | `/api/apply/tracker`                    | full tracker state |
| GET    | `/api/apply/backups`                    | list tar.gz backups in state dir (FIFO 10) |
| GET    | `/api/guide`                            | application guide |
| POST   | `/api/guide/:target/entries`            | upsert guide entry (`target` ∈ CLAUDE.md, AGENTS.md) |
| DELETE | `/api/guide/:target/entries/:patchId`   | remove guide entry |
| POST   | `/api/guide/:target/reorder`            | `{ patchIds: [] }` — full-order reorder |
| GET    | `/api/triggers`                         | trigger vocabulary |
| POST   | `/api/triggers`                         | add trigger |
| DELETE | `/api/triggers?trigger=...`             | remove trigger |
| GET    | `/api/hook-registry`                    | current global hook registry (mirrors state dir file) |
| GET    | `/api/manager`                          | manager install status per tool |
| POST   | `/api/manager/install`                  | install manager for given tools |
| POST   | `/api/manager/uninstall`                | uninstall manager from all tools |
| GET    | `/api/orphans`                          | list orphans |
| DELETE | `/api/orphans/:type/:id`                | force-uninstall skill/agent orphan |
| DELETE | `/api/orphans/patch/:target[?force=1]`  | force-uninstall patch master orphan |

All request/response shapes are derived from Zod schemas in
`ui/src/shared/schemas.ts`. The typed client wrapper is `ui/src/client/api/client.ts`
— when adding an endpoint, add it there too to keep the client/server in sync.

---

## 9. Frontend surface

### 9.1 Pages (router)

- `/` → `Home` (dashboard: counts, last Apply, links).
- `/welcome` → `Welcome` (2-step init wizard: state init + manager install).
- `/catalog` → `CatalogBrowser` (cards, filters by type/scope/tool).
- `/catalog/:type/:id` → `CustomDetail` (versions, active toggle, target/tools, save).
- `/guide` → `ApplicationGuide` (per-target patch list: toggle, reorder, version change, add).
- `/triggers` → `Triggers` (vocabulary editor).
- `/apply` → `Apply` (plan view, warnings, blockers, Apply button, post-apply result).
- `/history` → `History` (past Applies).
- `/settings` → `Settings` (catalog path, tools override, known projects, manager install, orphans).

### 9.2 Hooks and async pattern

No global store. Pages use `useAsync(() => api.xxx())` hooks that return
`{ data, loading, error, refresh }`. Wrap mutations in `useAsync` + manual
`refresh()` on success. Errors bubble up as `ApiClientError` with status/code.

---

## 10. The manager agent

### 10.1 Identity

- **id**: `manager`
- **type**: `agent`
- **category**: `system`
- **scope**: `global`
- **activeVersion**: see `manager/manifest.json`. Currently `0.9.0`.
  (v0.8.x = gentle-ai enumeration series — §§10.11–10.13;
  v0.9.0 = Show-before-write becomes opt-in — §10.14.)

Not under `customizations/`. Factory-protected. Installed/uninstalled only
through `/api/manager/*`.

### 10.4 v0.2.0 protocol additions (over v0.1.0)

- **Project inference from cwd (body §3.8)**: manager runs `pwd` +
  `git config --get remote.origin.url` at boot and, when the user picks
  `scope: project`, proposes `{ name, path, repoUrl }` as a suggestion.
  User confirms or corrects. Never commits silently.
- **Patch auto-detection (body §3.4)**: manager reads the tool's
  baseline (`<master>.original` preferred, fallback to current master
  on first patch). Proposes candidate regions from the baseline.
  Blocking validations for missing master/baseline states. The manager
  NEVER asks the user to paste a before-region anymore.
- **Gentle-ai detection (body §3.9)**: on-demand scan of `CLAUDE.md`
  and `AGENTS.md` for `<!-- gentle-ai:<tag> -->` markers. Same regex
  as the UI (`[a-zA-Z0-9_-]+`). Refuses to wire
  `dependencies.gentleAi` when zero tags found. Asks whether each
  referenced tag is a skill or an agent before emitting
  `dependencies.customs` entries.
- **Guided exploration (body §0.6)**: no subagent delegation. Manager
  does its own reads using Read/Glob/Grep. Always scopes with the
  user before broad scans. Read-only outside its write scope.
- **Agent creation checklist (body §2.10)**: when `op = create` AND
  `type = agent`, walks 9 extra dimensions (triggers, role, scope,
  procedure, tools, delegation, input, output, failures,
  anti-patterns) one at a time before Show-before-write.

### 10.5 v0.3.0 protocol additions (over v0.2.0)

- **Skill frontmatter is now MANDATORY (body §4.3)**. Every
  `SKILL.md` the manager produces opens with a YAML frontmatter block
  with at least `name` and `description`. Before v0.3.0 the skill
  template shipped as plain markdown and skills were born without
  semantic-activation metadata — a silent breakage of Claude Code's
  matcher and (per spec) Opencode's recognition.
- **Per-tool frontmatter schemas (body §4.3.a)**:
  - Claude `claude/SKILL.md` gets the full Claude Code schema —
    `name`, `description`, plus optional `when_to_use`, `paths`,
    `allowed-tools`, `disable-model-invocation`, `user-invocable`.
  - Opencode `opencode/SKILL.md` gets the reduced Opencode schema —
    `name`, `description`, plus optional `license`, `compatibility`,
    `metadata`. Claude-only fields MUST be stripped from the mirror
    (Opencode ignores them silently but they mislead human readers).
- **Frontmatter guidance (body §4.3.b)**: description front-loads
  the use case; combined `description + when_to_use` ≤ 1536 chars;
  `paths` is Claude-only and only set when the user explicitly asks
  for auto-activation on file patterns.
- **Skill creation questions (body §2.11)**: when `op = create` AND
  `type = skill`, the manager now asks two extra dimensions beyond
  the base — description (with front-loaded trigger) and optional
  auto-activation paths. Analogous to 2.10 for agents but lighter.

### 10.6 v0.4.0 protocol additions (over v0.3.0)

- **Step 2.11 rewritten — collaborative frontmatter drafting
  (propose-don't-decide).** The manager NO LONGER asks the user to
  write the skill's `description` or `paths` verbatim. Instead:
  1. Gathers requirements conversationally (what the skill does, when
     it fires, file-match vs semantic scope).
  2. **Drafts** the frontmatter itself, inferring `paths` globs from
     the user's stated trigger.
  3. **Proposes** the draft compactly (both tool variants side by
     side) and asks for field-level confirmation/correction.
  4. Iterates on corrections without redoing the whole proposal.
  5. Only THEN proceeds to Show-before-write (Step 1.6) with the
     confirmed frontmatter baked in.
- **Drafting rules codified**: description front-loads WHEN + WHAT
  under ~180 chars target; `paths` inferred narrowly from stated
  trigger only (widen only on explicit request); Claude and Opencode
  mirrors carry the same verbatim description.
- **Same pattern as elsewhere**: mirrors the propose-don't-decide
  flow already in patch auto-detection (body §3.4) and project
  inference from cwd (body §3.8). Consistent mental model for the
  user: describe intent → manager drafts → you confirm or correct.

### 10.7 v0.5.0 protocol additions (over v0.4.0)

Three coordinated changes:

- **Language audit — `Paso` → `Step` globally.** Spanish terminology
  leaking into the manager body is now gone. The index at the top
  says "5 steps"; every section heading and cross-reference reads
  `Step`. No content changes from the rename — pure terminology fix.
- **New body §0.7 Language policy.** Explicit split:
  - **Artifacts written to disk** (catalog files, manifests, skill
    and agent bodies, patches, guide entries, trigger vocabulary,
    new manager version folders) → ALWAYS simple English.
    Non-negotiable.
  - **Communication with the user** (questions, explanations,
    summaries, narration around artifact proposals) → matches the
    user's language. Artifact fragments inside a non-English
    explanation stay English verbatim — they are what will be
    persisted.
  - Style target for English artifacts: simple, direct, explicit,
    concise, compact, authoritative, clear (expanded in body §4.1).
- **New body §1.7 Universal propose-don't-decide pattern.**
  Five-beat arc codified once for all operations:
  1. Free expression (user leads).
  2. Clarifying questions (incremental, 1-at-a-time, per 1.2/1.3).
  3. Free-expression fallbacks during questioning (recognise and
     yield).
  4. Draft + propose (manager leads — never ask user for verbatim
     artifact content).
  5. Iterate to confirm, then persist.
  Every Step 2 operation (`create`, `improve`, `version-bump`,
  `classify`, `adapt-to-tool`, `delete`) follows this arc. Sub-steps
  2.10, 2.11, 3.4 remain as operation-specific tunings.
- **Body §2.8 Analyst mode rewritten.** Explicitly invokes the 1.7
  arc for `improve` / `classify` / `adapt-to-tool` / `delete`, with a
  concrete diff-style proposal shape per op. Cross-op warnings (e.g.
  tracker state on `delete`, re-Apply reminder on `improve`) now
  live in beat 4 so the user sees them BEFORE they confirm.

### 10.8 v0.6.0 protocol additions (over v0.5.0)

Agent invocation symmetry across tools. Before v0.6.0 Claude agents
could only be auto-invoked by description match; slash-command
invocation was a privileged one-off for the manager. Now any agent
can opt into a slash-command companion.

- **Body §2.10 checklist grows from 9 to 11 dimensions**:
  - **Dimension 10 — Opencode mode**: `primary` (Tab-selectable) vs
    `subagent` (auto-delegated). Default lean now leans toward
    `subagent` unless the user wants explicit invocation. Previous
    versions always defaulted to `primary`.
  - **Dimension 11 — Claude slash-command companion**: opt-in `yes/no`
    for a second authoring file
    `customizations/agents/<id>/v<ver>/claude/slash-command.md`
    that the installer copies to `<claude>/commands/<id>.md`.
- **Body §4.4 rewritten** to document the optional companion file, a
  minimal template for its body (delegates to the subagent via Task),
  and a cross-tool invocation-symmetry table:

  | Explicit invocation | Claude | Opencode |
  |---|---|---|
  | User-triggered | `slash-command.md` companion → `/<id>` | `mode: primary` → Tab selector |
  | Implicit (auto) | subagent body alone, matched on `description` | `mode: subagent`, matched on `description` |

- **No schema change.** The companion file is detected by PRESENCE in
  the version folder. `AgentManifestSchema` stays unchanged.
- **Installer multi-asset**: `ui/src/server/installer/paths.ts`
  `resolveInstallPath` now returns an ARRAY of `{sourceFile, destFile}`
  per (tool, custom, scope) tuple. For Claude agents, when the
  authoring contains `slash-command.md` the array has 2 entries (agent
  body + slash command); otherwise 1. `planner.ts` iterates the array
  when building physical ops. Tracker records one op per asset — so
  upgrade / uninstall / orphan paths all handle companions naturally
  without special casing.

### 10.9 v0.7.0 protocol additions (over v0.6.0)

Per-agent model assignment. Agents can now be authored with a
tool-specific `model:` field in their frontmatter (Claude subagent
body and/or Opencode agent body).

- **Body §2.10 checklist grows to 12 dimensions**:
  - **Dimension 12 — Model assignment per tool** — one conceptual
    question asked once, answered per tool. Claude: alias
    (`opus`/`sonnet`/`haiku`/`inherit`) or full ID (from the
    `knownVersions` list in the catalog registry). Opencode:
    `provider/model-id` from the detected registry. Default on both:
    OMIT the field (inherit). Manager NEVER invents IDs that are not
    in the relevant registry.
- **Body §4.4 frontmatter templates** updated with optional `model:`
  lines for both tool variants.
- **Two new registries**:
  - Claude — STATIC, catalog-side at
    `.ai-customizer/models/claude.json`. User-editable. Shipped with
    sensible defaults. Exposed via `GET /api/tools/claude-models`.
  - Opencode — DETECTED, state-side at
    `~/.config/ai-customizer/opencode-models.json`. Populated on
    demand by `POST /api/tools/opencode-models/refresh` which reads
    the user's `~/.cache/opencode/models.json` +
    `~/.local/share/opencode/auth.json` + env vars (same algorithm
    gentle-ai uses). Filters to providers authenticated AND with at
    least one `tool_call` model.
- **New UI feature (Settings → Models)**: shows both registries side
  by side. Claude block displays aliases + known versions (read-only,
  user edits the JSON directly). Opencode block lists detected models
  + Refresh button.
- **New UI feature (CustomDetail → Model assignment)**: for agents
  ONLY, a per-tool dropdown (Claude + Opencode) lets the user change
  the model. Saving calls `POST /api/customs/agent/:id/model` with
  `{ claude?, opencode? }` (value | `null` to unset | omitted to skip
  that tool). Server PATCH-BUMPS the version: clones the activeVersion
  folder to `v<current+0.0.1>/`, rewrites `model:` in each targeted
  per-tool body, appends a new entry to `manifest.versions[]`, and
  bumps `activeVersion`. This is the ONLY UI-driven write into
  `customizations/**` content — explicitly the single exception to
  the rule (see §6.10 "Never commit user state"). Next Apply then
  installs the new version.
- **Installer impact**: zero new code paths. Model changes are just
  version bumps; the general upgrade flow handles them.

### 10.10 v0.7.1 protocol additions (over v0.7.0)

Audit fixes on v0.7.0's model-assignment rollout. Two bug fixes
in the manager body; no new features.

- **Body §0.3 READ list** now explicitly allows
  `~/.config/ai-customizer/opencode-models.json`. Without this
  exception, the broader "never touch state dir beyond config.json"
  rule forbade the manager from reading the Opencode registry that
  dim 12 needs.
- **Body §2.10 dim 12** rewritten to instruct FILESYSTEM reads of
  both registries:
  - Claude: `<catalogPath>/.ai-customizer/models/claude.json` (direct
    file read).
  - Opencode: `~/.config/ai-customizer/opencode-models.json` (direct
    file read).
  The previous wording referenced `GET /api/tools/claude-models` and
  `GET /api/tools/opencode-models`, which the manager cannot invoke
  (filesystem tools only, no HTTP client). Those endpoints remain
  documented as the UI's view for user-facing context but are NOT
  the manager's action path.
- Server-side audit fixes (not manager-driven):
  - `agent-model.ts::changeAgentModel` now rolls back the cloned
    version folder on mid-flight failure or when the resulting diff
    is empty (prevents orphan `v<next>/` dirs on disk).
  - `POST /api/customs/agent/:id/model` returns `409 Conflict` (was
    `400`) for `wrong-type`, `version-missing`, `tool-variant-missing`,
    and `no-effective-change`. Keeps status codes aligned with §8
    conventions.
  - `updateToolBody` now errors with `tool-variant-missing` (was
    silent-skip) when the requested tool has no body in the current
    version — prevents "save succeeded, nothing changed" surprise.

### 10.11 v0.8.0 protocol additions (over v0.7.1)

Gentle-ai capability enumeration — the manager can now reference
gentle-ai's installed skills, slash commands, and agents when
authoring customs, instead of just detecting that gentle-ai exists.

- **Body §0.3 READ list expanded** to include the tool-side dirs
  gentle-ai's artifacts live in: `~/.claude/skills/**`,
  `~/.claude/agents/**`, `~/.claude/commands/**`,
  `~/.config/opencode/skills/**`, `~/.config/opencode/agent/**`.
  All read-only; the manager still never writes into these paths.
- **Body §3.9 rewritten as a two-phase protocol**:
  - **Phase 1 — install detection** (existing tag scan): walks
    `CLAUDE.md` and `AGENTS.md` for `<!-- gentle-ai:<tag> -->`.
    Presence = gentle-ai installed. Absence = skip Phase 2.
  - **Phase 2 — capability enumeration** (NEW): lists
    `~/.claude/skills/` + reads each `SKILL.md` frontmatter;
    `~/.claude/commands/` + reads each command file;
    `~/.claude/agents/` (minus our own manager); same for Opencode.
    Builds a compact map of `{ thematicTags, claudeSkills,
    claudeSlashCommands, claudeAgents, opencodeSkills,
    opencodeAgents }`.
  - Guidance on using the enumeration during authoring — body text
    references gentle-ai skill IDs by exact match; manifest carries
    `dependencies.gentleAi.required = true`; do NOT add gentle-ai
    skills to `dependencies.customs` (that field is for this
    catalog's skills/agents only — adding a name not in the catalog
    would make the planner fail with `dependency-missing-in-catalog`).
- **New Body §3.4.g** — Patches targeting gentle-ai tag sections.
  Documents the primary patch use case: override/extend a thematic
  block of a master. Boundaries = from the `<!-- gentle-ai:<tag> -->`
  line to just before the next heading of equal or higher level (or
  the next tag marker). The `before.md` is that full block from
  `.original`.
- **Body §2.10 / §2.11 nudges** — during agent or skill creation, if
  the intent overlaps with what gentle-ai provides (SDD workflow,
  issue/PR creation, adversarial review, engram memory protocol,
  etc.), the manager runs Phase 1 + Phase 2 BEFORE Show-before-write
  and proposes concrete references in the body.
- **A TAG IS NOT A SKILL ID** is emphasised throughout §3.9.
  Previous versions conflated the two and asked the user *"is this
  tag a skill or an agent?"* — that was wrong. A tag is a thematic
  marker in the master; a skill is an invokable unit in the skills
  dir. The two are related but distinct.

### 10.12 v0.8.1 protocol additions (over v0.8.0)

Audit-fix pass on v0.8.0's gentle-ai enumeration rollout. Three
coordinated changes that together tighten a core principle: **the
manager reads nothing about gentle-ai unsolicited**.

- **Trigger vocabulary formalized (body §3.9)**. New sub-section
  enumerates the explicit signals that license running each phase:
  *direct* (*"is gentle-ai installed?"*), *indirect* (user names a
  gentle-ai concept or capability), *discovery* (*"what can I use?"*),
  *composition* (*"use sdd-verify in this"*). If no signal is
  present, NO phase runs. The old "intent overlaps with gentle-ai"
  license is removed — too soft; caused the manager to run
  enumeration even when the user never mentioned gentle-ai.
- **New Phase 3 — deep read (body §3.9)**. Phase 2 stays shallow
  (frontmatter only: id + description). When the user picks a
  specific capability to reference, Phase 3 Reads the full body and
  extracts `whenToInvoke / whatItDoes / output / rules / antiPatterns`
  so the manager can reference precisely in the user's custom. Each
  deep-read is scoped per 0.6 individually. This answers the
  long-standing question "how does the manager know what each
  gentle-ai thing actually does?" — it doesn't, until the user
  commits to referencing it, at which point Phase 3 provides
  operational detail.
- **Presentation improvements (body §3.9)**. Shallow enumeration
  output now groups skills by natural prefix (SDD workflow, PR/issue,
  Review, Skill authoring, Other) and separates ambient tags from
  invokable skills from user-typed slash commands. A new terminology
  glossary at the top of §3.9 makes the four-way distinction
  (tag / skill / slash command / subagent) explicit with a table.
- **Steps 2.10 and 2.11 composition-check paragraphs rewritten**.
  The old language said *"if intent overlaps with gentle-ai, run
  the enumeration"*. New language says *"ONLY when the user has
  given a gentle-ai signal per 3.9's trigger vocabulary"*. Aligns
  with the strict-opt-in principle.

### 10.13 v0.8.2 protocol additions (over v0.8.1)

Catch-up with current Opencode spec: `mode: all` is now a first-class
option alongside `primary` and `subagent`. Opencode docs at
opencode.ai/docs/agents document three values; previous manager
versions only knew the first two. Pure documentation/protocol fix
— the installer doesn't validate frontmatter `mode`, so no installer
change was needed.

- **Step 2.10 dim 10 rewritten** with the three explicit options:
  - `primary` — Tab-only, direct user invocation, no auto-delegation.
  - `subagent` — delegation-only by primaries, plus user `@agent`
    references.
  - `all` — both invocation paths. Canonical example from the user's
    own catalog: an agent like `dev-planner` is genuinely useful
    Tab-selected (the user picks it to plan a task) AND auto-delegated
    (other primaries call it for sub-task planning).
- **Default lean changed**: when the user has no preference, the
  manager now leans toward `all` instead of `subagent`. Rationale:
  matches Opencode's omit-default, gives the user both paths
  upfront, can be tightened later if needed. v0.6.0 had defaulted
  to `subagent` in a two-option world; with the third option
  available, `all` is the more-flexible safe bet.
- **Step 4.4 Opencode frontmatter template** updated:
  `mode: primary | subagent | all  ← from 2.10 dim 10. Omit to
  default to 'all'.` The "When to use me" section now has three
  variants (one per mode value).
- **Cross-tool invocation symmetry table** in §4.4 expanded from
  2 rows to 3:

  | User intent | Claude side | Opencode side |
  |---|---|---|
  | Direct only | slash-command companion | `mode: primary` |
  | Delegation only | bare subagent body | `mode: subagent` |
  | Both | companion + bare body | `mode: all` |

- **§17 cheat sheet** "Primary vs subagent" row reframed to mention
  the `mode:` field and its three valid values.

### 10.14 v0.9.0 protocol additions (over v0.8.2)

Show-before-write becomes opt-in. Step 1.6 was previously a HARD
rule: *"Before writing ANY file, show all artifacts ... Do NOT skip
the show step because the user will trust me"*. v0.9.0 reframes
1.6 as a "Pre-write protocol" with two paths chosen by the user.

- **Step 1.6 rewritten**:
  - **Step 1** — *Ask once*. When write-ready, the manager asks
    *"Show the full artifacts first, or go straight to writing?"*.
    The answer applies to the entire batch. Re-ask only on a
    genuinely new batch later in the same conversation.
  - **Pre-declared preferences skip the question**. Recognised:
    `just write` / `no necesito ver` / `go ahead` / `directo` /
    `don't show me` / `escribe directamente` (skip-show); and
    `always show me` / `siempre muéstrame` / `never write without
    showing` (always-show).
  - **Step 2A — Show path**: present manifest + every per-tool
    file in code blocks; iterate on user edits; write on approval.
  - **Step 2B — Skip path**: write all files atomically; announce
    paths.
  - **Always**: announce absolute paths after writing and remind
    the user to run Apply (or register the patch in the guide).
- **Hard rule changed** from *"Do NOT skip the show step"* to
  *"Asking is mandatory unless the user pre-declared"*. The
  manager never silently picks a path.
- **References preserved**. Older callers (Steps 2.10, 2.11,
  3.4.e, 1.7) keep saying *"go to Show-before-write"* — that
  colloquial label still points at 1.6, which now branches.

### 10.2 Claude-only slash command (v1.0.6+)

Installing the manager on Claude creates **two** files:
- `~/.claude/agents/manager.md` — the subagent body.
- `~/.claude/commands/manager.md` — the slash-command frontmatter that
  invokes the subagent via `/manager`.

This lets the primary invoke the subagent via `/manager` explicitly, instead
of auto-delegating on every "create skill"-shaped request. Opencode has no
slash commands, so its install is a single file.

**Slash-command pattern (general)**. If you need to ship a slash command for
something other than the manager, the pattern is:
- A markdown file at `~/.claude/commands/<name>.md` with YAML frontmatter
  (see `manager/v0.9.0/claude/slash-command.md` for the canonical example).
- The body typically delegates to a subagent or runs instructions in the
  primary — it's just a prompt template Claude invokes on `/<name>`.
- Installation goes through the same `ManagerAsset`-style 2-asset atomic
  install pattern if you want it bundled with an agent, or a custom route
  if it's standalone. There is no dedicated "slash command custom type" in
  v1; the manager is the only shipped example.

### 10.3 5-step authoring protocol

The manager's body prescribes a strict 5-step protocol when asked to create
or edit a custom:
1. **Identity and mode** — confirm which catalog, which tool(s), which scope.
2. **Communication** — ask clarifying questions, never silently assume.
3. **Intent → operation** — map the user's intent to exactly one operation
   (create / improve / version / reclassify).
4. **System playbook** — for each operation type, follow the exact file
   layout (manifest + version folders + per-tool files) and invariants.
5. **Content templates** — use the shipped templates for SKILL.md / agent.md /
   before.md+after.md shapes.

Read `manager/v0.9.0/claude/manager.md` for the full current text. DO NOT
hand-edit this in the catalog; bump a new version folder instead.

---

## 11. State, concurrency, safety

### 11.1 State dir location

`~/.config/ai-customizer/` by default. Overridable with
`AIC_USER_CONFIG_DIR=/some/path`. Per-machine, shared across all catalogs on
that machine. Switching catalogs reuses the same tracker/history but points
at new content — prior installs surface as orphans until cleaned up.

### 11.2 Concurrency model

- Single UI process per machine (`.lock`).
- Tracker and guide writes serialized per catalog path via
  `ui/src/server/util/mutex.ts`.
- Read endpoints are lock-free (stale reads are fine; writes are atomic).
- Backup creation is NOT inside the mutex — we snapshot → then enter
  mutex for tracker commit. A crash between backup and commit loses the
  commit but leaves a valid backup.

### 11.3 Failure modes and recovery

| Failure | Recovery |
|---|---|
| UI crash mid-Apply | Tracker untouched (not yet written). Partial tool-dir changes recoverable from last backup tar.gz. |
| Plan has blockers | `executor.ts` short-circuits: returns `ApplyResult: 'rolled-back'` with `error` string, no backup, no tracker write, no history entry for the "attempt". The UI shows the blockers from the preceding `/api/apply/plan` call. |
| Patch compose fails at execute time | Auto-restore from tar.gz; history entry marks `rolled-back`. |
| Rollback itself fails | `ApplyResult: 'rollback-failed'`. State is inconsistent — restore manually from `~/.config/ai-customizer/backups/apply-*.tar.gz` (last tar.gz before the failure). |
| `.original` deleted by user | First next patch Apply re-snapshots current master as `.original`. User gets fresh baseline (intentional feature, not a bug). |
| Stale `.lock` after crash | proper-lockfile auto-clears locks older than 60s on the next acquire attempt. Either wait ~60s and restart, or delete `~/.config/ai-customizer/.lock` manually. The PID inside is metadata only. |
| Tracker references deleted custom | Orphan. Force-uninstall. |
| Catalog moved/renamed | Update `config.json.catalogPath` via Settings, or `CATALOG_PATH` env var. Existing tool files continue to work; tracker paths remain valid. |
| Schema mismatch in `install-state.json` / `application-guide.json` / etc. | `safeParse` fails → reader returns an empty/default document. **No error is raised.** The UI behaves as if the file were absent. If you change a schema, add a migration path; do NOT rely on the fallback to "protect" users — it silently loses their state. |

---

## 12. Release and versioning

Current version: **v1.4.0**. Semver.

**Bump locations** (update all on release):
1. `ui/package.json.version`
2. `ui/src/server/index.ts` inside `/api/health` response (`version: '1.0.7'`)
3. Status line in `README.md` (`Status: v1.4.0.`)

**Commit pattern**: conventional commits, English. Examples from git log:
- `feat: add install.sh and update.sh scripts, bump to v1.0.7`
- `feat(manager): Claude-only slash command invocation`
- `chore: bump to v1.0.6`
- `docs(manager): iter 5/5 — final consistency sweep`
- `chore: reset application-guide.json to factory state`

**Tagging**: `git tag -a vX.Y.Z -m "vX.Y.Z — summary"` then `git push origin main && git push origin vX.Y.Z`.

**Never** add `Co-Authored-By` lines to commits. **Never** build after changes
in this repo — CI / release process does that.

**Manager version bumps** are separate from the UI version. Manager lives at
`manager/v<X.Y.Z>/` with its own `manifest.json.activeVersion`. To publish a
new manager version: create the new folder, update `manifest.json`, commit.
The UI detects the mismatch and offers Reinstall in Settings.

---

## 13. Scripts (install.sh, update.sh)

### 13.1 `install.sh`

- Idempotent. Safe to rerun; probes ports `3236` + `5256` via bash
  `/dev/tcp`. If either is bound, prints "already running" and exits 0
  (no-op).
- Checks `node` (v20+), `npm`, `git` on PATH.
- Verifies `.ai-customizer/catalog.json` and `ui/` exist.
- `cd ui && npm install` (npm's own idempotency makes this a fast no-op
  when `package-lock.json` already matches).
- `exec npm run dev` in foreground (Ctrl+C to stop).

### 13.2 `update.sh`

- Hardcoded upstream: `UPSTREAM_URL=https://github.com/rigomatuja/ai-customizer.git`, `UPSTREAM_REMOTE=upstream`, `UPSTREAM_BRANCH=main`.
- Auto-adds the `upstream` remote on first run; errors if an `upstream` remote
  exists with a different URL (won't silently redirect).
- Warns on dirty working tree, asks to continue.
- `git fetch upstream main` then `git checkout upstream/main -- <path>` for
  each of: `ui`, `manager`, `docs`, `.claude/skills`, `.opencode/skills`,
  `.ai-customizer/models`, `install.sh`, `update.sh`, `README.md`,
  `LICENSE`, `.gitignore`. Note that `.ai-customizer/` as a whole is
  NOT in the list — only the `models/` subdir (shipped, template-owned).
  The sibling files `.ai-customizer/triggers.json` and
  `.ai-customizer/catalog.json` remain user-owned and untouched.
- **Self-updating.** `install.sh` and `update.sh` are in `UPDATE_PATHS`,
  so the scripts ship their own updates. The running bash process keeps
  the old inode open (git checkout replaces the file, doesn't edit it
  in place), so the old script finishes cleanly; the new version takes
  effect from the next invocation. When this happens the script prints
  a `[!] install.sh / update.sh were updated in this run` notice.
- **Never** touches `customizations/**`, `application-guide.json`,
  `.ai-customizer/triggers.json`, `.ai-customizer/catalog.json`.
- After checkout: detects whether anything actually changed and prints a
  visible `[i] Already up to date — no-op` when there are no diffs.
- Always runs `cd ui && npm install` after checkout (idempotent; skipped
  if `ui/` doesn't exist).
- At the end, if no UI is already running, prompts `Launch the UI now?
  [Y/n]`. Y → `exec npm run dev`. N → prints the manual command and
  exits.
- Leaves changes staged in the working tree; prints hints (Settings →
  Reinstall if `manager/` changed).
- Does not auto-commit.

---

## 14. Environment variables

| Var | Default | Purpose |
|---|---|---|
| `CATALOG_PATH`         | walk up from the server source file looking for `.ai-customizer/catalog.json` | Override the catalog root the server reads from |
| `AIC_USER_CONFIG_DIR`  | `~/.config/ai-customizer/` | Override the per-machine state dir |
| `PORT`                 | `3236` | Override the Hono server port |
| `AIC_LOG_JSON`         | unset | `1` for line-delimited JSON logs |

`vite.config.ts` has `strictPort: true` on `5256` and the proxy target
`http://127.0.0.1:3236` is hardcoded. Running two UIs simultaneously requires
editing vite config — by design, v1 expects one UI per machine.

---

## 15. Testing and local dev

- `npm run dev` in `ui/` — Hono + Vite concurrently.
- `npm run typecheck` — `tsc --noEmit`. Run before commits.
- `npm run build` — typecheck + Vite client bundle to `dist/client/`.
- `npm start` — server only, no watch (for non-dev use).

**There is no automated test suite shipped.** `ui/package.json` has no
`test:*` scripts; there is no test runner dependency (no Vitest, Jest, Pest,
etc.) and no `__tests__/` / `*.test.ts` / `*.spec.ts` files. Design bias in
v1 is toward small, pure functions (planner, composer, path resolvers) that
are easy to test in isolation when we do add tests. The concurrency
primitives and atomicity guards were validated via ad-hoc scripts (e.g. 10
parallel upserts against the guide) during development. When you introduce
a suite, target `computePlan` and `composePatches` first — those are the
two pieces where regressions hurt users.

For manual smoke testing, follow the README's "Hello world" section: hand-
author a skill, toggle it in the UI, Apply, verify on disk, toggle off, Apply.

---

## 16. Conventions and rules

- **Conventional commits**, English. No `Co-Authored-By`. No AI attribution.
- **Never build after changes** (see §12).
- **Prefer `rg` / `fd` / `bat` / `sd` / `eza`** over `grep` / `find` / `cat` / `sed` / `ls`
  when running commands as an agent. The shipped `update.sh` uses `grep` for
  portability (can't assume `rg` on user machines) — that's intentional.
- **No emojis** in code or docs unless the user explicitly asks.
- **Never commit user state** (see §6.10).
- **Never bypass invariants** (§6) for expedience. If you think you need to,
  escalate with a design note, don't silently work around.
- **Ask before destructive actions**: deleting branches/files, force-push,
  `rm -rf`, resetting state.

---

## 17. Claude vs Opencode (cheat sheet)

| Concern | Claude | Opencode |
|---|---|---|
| Tool config dir | `~/.claude/` | `~/.config/opencode/` |
| Skill path | `skills/<id>/SKILL.md` | `skills/<id>/SKILL.md` |
| Agent path (plural vs singular) | `agents/<id>.md` | `agent/<id>.md` |
| Slash commands | `commands/<id>.md` (yes) | (no such feature) |
| Master patch file | `CLAUDE.md` (+ `.original`) | `AGENTS.md` (+ `.original`) |
| Primary vs subagent | Subagent pattern (body + optional slash command) | Per-agent `mode:` field — `primary`, `subagent`, or **`all`** (both). Omitted = `all` per Opencode spec. |
| Project scope dir | `<project>/.claude/` | `<project>/.opencode/` |
| Project-scoped skills discovery | `.claude/skills/<name>/SKILL.md` | `.opencode/skills/<name>/SKILL.md` |
| Skill `paths` frontmatter (auto-activate on file-match) | supported | **unsupported** (field silently ignored) — semantic match via `description` only |
| Skill `hooks` frontmatter | supported | unsupported |
| Skill frontmatter schema | `name`, `description`, `when_to_use`, `paths`, `hooks`, `allowed-tools`, `model`, `effort`, `context`, `agent`, `shell`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable` | `name`, `description`, `license`, `compatibility`, `metadata` (unknown fields ignored) |
| Per-agent model field value format | `model: <alias\|full-id>` — `opus`/`sonnet`/`haiku`/`inherit` or `claude-opus-4-7`. Registry: STATIC catalog-side `.ai-customizer/models/claude.json` (editable) | `model: <provider>/<model-id>` — e.g. `anthropic/claude-sonnet-4-5`. Registry: DETECTED state-side `~/.config/ai-customizer/opencode-models.json` (refreshable from Settings) |

The code treats each tool as a first-class enum (`Tool = 'claude' | 'opencode'`)
and dispatches on it in installer path resolvers (`ui/src/server/installer/paths.ts`)
and detection logic. When adding support for a third tool, start there.

---

## 18. Not in v1 (roadmap)

From `DESIGN.md` §12 and README "Not in v1":

- Multi-target install (same custom in multiple projects at once).
- Named profiles (snapshots of active state, switch between).
- Import/export individual customs as portable bundles.
- File watcher for catalog changes (currently: manual refresh).
- Diff viewer between custom versions.
- Schema migration tooling.
- "Factory reset from origin" (updater handles code-side sync; factory reset
  would wipe customs — deliberately out of scope).
- Project-scoped patches (patches are global-only today).
- Windows support (path + rename semantics).
- Two simultaneous UIs (lock + ports; see §14).

---

## 19. Gotchas (things that will bite you)

1. **State dir is shared across catalogs**. Opening the UI from a second catalog
   on the same machine makes installs from catalog #1 show as orphans. Use
   `AIC_USER_CONFIG_DIR` to isolate test environments.
2. **`.original` is sticky**. Uninstalling every patch restores the master but
   keeps `.original`. This is intentional (idempotence). To reset the baseline,
   delete `.original` manually — the next patch Apply will re-snapshot.
3. **Manager tracker ops are excluded from the planner**. If you refactor the
   planner, preserve this exclusion or the manager gets blown away on first
   Apply (§6.6).
4. **Zod schemas are the source of truth**. Types in `ui/src/shared/types.ts`
   are derived from schemas, not hand-written. Edit schemas first, let
   types follow.
5. **Symlink guard on copy**. `copyFile` in `installer/fs-utils.ts` calls
   `fs.realpath` on src and dst and refuses if they resolve to the same
   inode (`source and destination resolve to the same path — refusing to
   clobber source`). This fires when a user has symlinked their
   `~/.claude/agents/` into this catalog, which would make an install
   overwrite the authored source. The manager installer has its own
   pre-check for the same condition. Backups use `tar` 7.x — check the
   exact options in `installer/backup.ts` if you care about symlink
   capture behavior.
6. **`vite.config.ts::strictPort: true`**. Second UI on 5256 fails hard, not
   silently on 5174. Intentional.
7. **Catalog JSON files are pretty-printed** (`JSON.stringify(x, null, 2) + '\n'`).
   Preserve this formatting when editing — the diff noise otherwise is painful.
8. **The installer runs `npm run dev` with `exec`**. It replaces the shell
   process — anything after the `cd ui && exec npm run dev` line in
   `install.sh` is dead code.
9. **Never use `git reset --hard` or `git clean -f`** automatically. The
   updater deliberately leaves changes in the working tree for human review.
10. **`proper-lockfile` staleness is time-based, not PID-based.** Lock is
    acquired with `{ stale: 60_000, retries: 0 }`. That means: server dies
    immediately if another UI holds the lock (no retry), AND any lock whose
    file mtime is older than 60s is considered stale and auto-cleaned on the
    next acquire attempt. The `{ pid, port, startedAt }` JSON in the lock
    file is metadata for the human-readable error message — it is NOT used
    for staleness checks. So after an unclean crash, wait 60s and you can
    boot normally; or delete `~/.config/ai-customizer/.lock` manually.
11. **System skill mirror drift.** Each of the 5 skills in
    `.claude/skills/` has a twin in `.opencode/skills/`. Their bodies are
    identical; only the frontmatter differs (Opencode's has no `paths`).
    When you edit one, edit BOTH — there is no test that enforces parity.
    Easy check before committing: `diff .claude/skills/<name>/SKILL.md
    .opencode/skills/<name>/SKILL.md` should show only the frontmatter
    block and the comment explaining Opencode's limitation.
12. **Opencode model registry is empty on first run.** The state-dir
    registry at `~/.config/ai-customizer/opencode-models.json` is NOT
    populated automatically — it exists only after the user clicks
    **Refresh** in Settings → Models (or calls the refresh endpoint).
    The refresh itself reads from `~/.cache/opencode/models.json`,
    which is populated by the `opencode models` CLI — if the user has
    never run that, the cache is empty and the registry stays empty.
    Symptoms: the manager's Step 2.10 dim 12 asks for an Opencode
    model and the detected list shows zero entries; UI dropdown says
    *"no models detected — refresh from Settings"*. Fix: user runs
    `opencode models` then clicks Refresh. The Claude registry is
    catalog-side and ships with defaults, so it is never empty.

---

## 20. Quick navigation (when you need it)

- Edit an API route → `ui/src/server/routes/<name>.ts` + matching
  `ui/src/client/api/client.ts` entry.
- Change a schema → `ui/src/shared/schemas.ts`. Types regenerate via `z.infer`.
- Add an invariant check to Apply → `ui/src/server/installer/planner.ts`
  (`Plan.warnings` for non-blocking, `Plan.blockers` for hard-fail).
- Change how a custom lands on disk → `ui/src/server/installer/paths.ts`.
- Change how backups work → `ui/src/server/installer/backup.ts`.
- Change manager install semantics → `ui/src/server/installer/manager-install.ts`.
- Bump a release → §12.
- Reset local state for testing → stop UI, `rm -rf ~/.config/ai-customizer/`,
  restart.
- **Read the matching system skill** before editing an area: when you
  touch `ui/src/client/**` read `.claude/skills/ui-design/SKILL.md`,
  when you touch `ui/src/server/**` or `ui/src/shared/**` read
  `.claude/skills/api-dev/SKILL.md`, and so on. See §22.

---

## 21. Where this document is out of date

This doc is a snapshot. If any of the following diverge from the code,
**trust the code**, then update this doc:

- Route list (§8) — grep `ui/src/server/routes/*.ts` for actual routes.
- Schema shapes — read `ui/src/shared/schemas.ts`.
- Manager version — read `manager/manifest.json`.
- UI version — read `ui/package.json` and `ui/src/server/index.ts` health response.
- Trigger vocabulary — read `.ai-customizer/triggers.json`.

When you update this doc, keep the structure (numbered sections, tables
where they fit, invariants in §6). An agent reading it should be able to
tell in one pass whether a given fact is described here or delegated to
another file.

---

## 22. System skills (template-side)

The repo ships five "system skills" at `.claude/skills/<name>/SKILL.md`
(and mirrored at `.opencode/skills/<name>/SKILL.md`) for agents working
on the TEMPLATE ITSELF — not for users of the catalog. They are NOT
installable via the UI. They are auto-discovered by Claude Code and
Opencode from those canonical paths.

**How auto-activation works**:
- **Claude Code** — every SKILL.md declares a `paths` frontmatter
  field with glob patterns. Claude Code auto-loads a skill ONLY when
  the agent is editing/reading files matching those globs. This is
  the precise "load when touching X" mechanism.
- **Opencode** — ignores the `paths` field (Claude Code-only). Opencode
  only matches skills semantically against the `description`. The
  mirrored Opencode SKILL.md files have the `paths` block stripped and
  a comment noting the limitation.

**The five skills**:

| Skill | Trigger (Claude Code `paths`) | Purpose |
|---|---|---|
| `readme-sync` | `README.md`, `install.sh`, `update.sh`, `ui/package.json`, `ui/src/server/index.ts`, `manager/manifest.json` | Keep the user-facing README in sync with reality. |
| `llm-sync` | `ui/**`, `manager/**`, `docs/**`, scripts, `.ai-customizer/**`, `application-guide.json`, `.claude/skills/**`, `.opencode/skills/**` | Keep THIS file (`docs/llm.md`) authoritative after any system change. Broadest scope. |
| `ui-design` | `ui/src/client/**`, `ui/src/shared/types.ts`, `ui/vite.config.ts`, `ui/index.html`, `ui/package.json` | React/Vite patterns, CSS class naming, page/panel structure, async-hook usage, primitive components. |
| `api-dev` | `ui/src/server/**`, `ui/src/shared/**`, `ui/src/client/api/**` | Hono route layout, Zod schema-first validation, error contract, atomic writes, per-key mutex, 4-step endpoint add flow. |
| `manager-sync` | `manager/**`, `ui/src/server/installer/manager-install.ts`, `ui/src/server/routes/manager.ts`, `ui/src/client/pages/Settings.tsx` | Version-bump procedure for the manager: new `vX.Y.Z/` folder, mirror Claude↔Opencode, update manifest + §10, verify section numbering, test via Reinstall. |

**Upstream propagation**: `.claude/skills/` and `.opencode/skills/` are
in `update.sh`'s `UPDATE_PATHS` — they ship with the template and
update on `./update.sh`. Users who modify a system skill locally will
see their changes overwritten on the next update (same semantics as
`ui/`, `manager/`, `docs/`).

**Adding a new system skill**:
1. Create `.claude/skills/<name>/SKILL.md` with `name`, `description`,
   and `paths` in the frontmatter.
2. Write the body following the existing skill structure (`## When I'm
   loaded`, `## Execution rule`, `## What I do`, `## Rules`,
   `## Anti-patterns`, `## References`).
3. Mirror to `.opencode/skills/<name>/SKILL.md` with `paths` stripped
   and the Opencode-limitation comment added.
4. Add a row to the table above.
5. If the new skill affects llm-sync's scope, extend llm-sync's `paths`
   accordingly.
