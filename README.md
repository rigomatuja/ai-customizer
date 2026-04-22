# AI Customizer

Customization manager for Claude Code and Opencode.

A template repo + local web UI + agent manager for creating, versioning, and
installing customizations for your AI code assistants. **One catalog, two
tools, full parity.**

## What you get

- **Catalog**: a git-versioned folder of customs you author (skills, agents,
  patches). Starts empty — you populate it.
- **Web UI**: local Hono + Vite + React app that browses the catalog and
  installs/uninstalls customs to your tools with atomic operations, backups,
  and rollback.
- **Manager agent**: a subagent (Claude) / primary agent (Opencode) that lives
  in your catalog and helps you create, improve, version, and classify
  customs — by asking questions and writing files in the right shape.

## Supported customization types

- **Skills** — markdown instructions loaded as context by the tool.
- **Agents** — invocable subagents / primary agents.
- **Patches** — idempotent find-and-replace overrides on `CLAUDE.md` /
  `AGENTS.md` with a shared `.original` baseline.
- **Hooks** — meta-tag on skills/agents (automated triggers on phases /
  agent-events / procedures). Consumed via a JSON registry.

## Quickstart

```bash
# 1. Clone this template as your catalog.
git clone git@github.com:<you>/<your-catalog>.git my-catalog

# 2. Install + launch the UI.
cd my-catalog/ui
npm install
npm run dev
```

The UI opens on `http://127.0.0.1:5173`. On first run a 2-step wizard walks
you through:

1. Initialize `~/.config/ai-customizer/` (your local state directory) and
   detect your installed tools (Claude, Opencode).
2. Install the **manager** agent on the tools you select.

After setup:

- Invoke the manager from Claude or Opencode (select `ai-customizer-manager`
  in Claude's subagents or switch to the **AI Customizer Manager** primary
  in Opencode's TUI) and say something like *"create a skill for reviewing
  API endpoints"*. The manager asks for details, drafts files, and writes
  them into `customizations/`.
- Or hand-author a manifest directly in `customizations/skills/<id>/` —
  the UI will pick it up on refresh.
- Toggle the custom active in the UI, pick a target (global or a known
  project), click **Apply**.

## Repo structure

```
.
├── docs/DESIGN.md               # full technical specification (27 decisions)
├── ui/                          # Hono + Vite + React web UI
├── manager/                     # manager agent (catalog ↔ manager contract)
│   └── v0.1.0/{claude,opencode}/manager.md
├── customizations/              # your customs (starts empty)
│   ├── skills/
│   ├── agents/
│   └── patches/
├── .ai-customizer/              # catalog config
│   ├── catalog.json             # schema version + catalog name
│   └── triggers.json            # hook trigger vocabulary (extensible)
└── application-guide.json       # patch composition order + active state
```

User state (outside this repo):

```
~/.config/ai-customizer/
├── config.json                  # catalogPath + tool overrides
├── install-state.json           # tracker (what's installed)
├── history.json                 # audit log of Apply operations
├── projects.json                # registered projects (for project-scope targets)
├── hook-registry.json           # global hook registry (regenerated on Apply)
├── backups/                     # tar.gz rotatives (últimos 10)
└── .lock                        # single-instance lock file
```

For project-scoped installs, a per-project hook registry also lands at
`<project>/.atl/hook-registry.json` (same dir convention as gentle-ai — no
filename collision).

## UI map

| Page | Purpose |
|---|---|
| **Home** | Dashboard: catalog counts, path, pending changes. |
| **Catalog** | Browse customs with filters (type, scope, category, tool, status). |
| **Custom detail** | Metadata, versions, install config (active toggle + target + tools). |
| **Guide** | Order / activation / version of patches per master file. |
| **Apply** | Preview the next Apply as a structured plan; execute or cancel. |
| **History** | Audit log of past applies with backups. |
| **Triggers** | Hook vocabulary editor + read-only hook registry view. |
| **Settings** | Catalog path, tool detection + overrides, manager controls, known projects, orphans, factory reset (coming). |

## Core principles

- **WYSIWYG on disk**: what's in the catalog is exactly what gets copied.
  No transformation, no runtime magic.
- **Parallelism per tool**: every custom has parallel `claude/` and
  `opencode/` folders. The manager produces both; the UI only copies.
- **Versioned by folder**: each version is a subfolder `vX.Y.Z/`.
  Multiple versions coexist. Current active version lives in `manifest.json`.
- **Manager creates, UI applies**: strict separation. The UI never edits
  custom content. The manager never touches your filesystem.
- **Apply is atomic**: all-or-nothing, with a tar.gz backup before, per-op
  rollback, tracker + `.original` sidecars, audit log.
- **Validations warn, never block**: unknown triggers, missing deps,
  orphaned references — surfaced as warnings. The user decides.

See [docs/DESIGN.md](docs/DESIGN.md) for the full specification (27 decision
blocks, data contracts, installer semantics).

## Scripts

```bash
cd ui/
npm run dev           # Hono server + Vite + React HMR (concurrently)
npm run server:dev    # only the server with hot reload
npm run start         # server, no watch
npm run build         # typecheck + Vite build
npm run typecheck     # tsc --noEmit
```

Environment overrides:
- `CATALOG_PATH=/abs/path` — override catalog root (default: parent of `ui/`)
- `AIC_USER_CONFIG_DIR=/abs/path` — override user state dir (default: `~/.config/ai-customizer/`)
- `PORT=3001` — override server port (default: 3000; UI dev proxies 5173 → 3000)

## Roadmap

| Milestone | Version | Scope |
|---|---|---|
| M1 | v0.1.0 | Foundation + spec in repo |
| M2 | v0.2.0 | UI scaffold (Hono + Vite + React) |
| M3 | v0.3.0 | Read-only catalog browser |
| M4 | v0.4.0 | Settings + first-run wizard + lock file + tool detection |
| M5 | v0.5.0 | Installer core (skills + agents) + atomic Apply + backups |
| M6 | v0.6.0 | Patches + application guide |
| M7 | v0.7.0 | Hook system + trigger vocabulary |
| **M8** | **v1.0.0** | **Manager agent + orphans + polish — you are here** |

## Not in v1 (deferred)

- Multi-target install (single-target per custom today).
- Profiles (named snapshots of active state).
- Import/export individual customs as portable bundles.
- File watcher for catalog changes (manual refresh for now).
- Diff viewer between custom versions.
- Schema migration tooling.
- Canonical template URL / "factory reset from origin".
- Project-scoped patches (global-only today).

## License

TBD.
