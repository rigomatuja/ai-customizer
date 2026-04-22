# AI Customizer

Customization manager for Claude Code and Opencode.

**Status**: Pre-alpha. Not usable yet. Active development.

## What is this?

A template repo + local web UI + agent manager for creating, versioning, and installing customizations for your AI code assistants. One catalog, two tools, full parity.

Supported customizations:
- **Skills** — markdown instructions loaded as context
- **Agents** — invocable sub-agents
- **Patches** — idempotent shadow overrides on `CLAUDE.md` / `AGENTS.md`
- **Hooks** — skills/agents with automated triggers (meta-tag)

See [docs/DESIGN.md](docs/DESIGN.md) for the complete technical specification.

## Quickstart

> Will be wired up in M2 (UI scaffold milestone).

```bash
git clone git@github.com:<you>/<your-catalog>.git my-catalog
cd my-catalog/ui
npm install
npm run dev
```

The first-run wizard will guide you through setup (coming in M4).

## Repo structure

```
.
├── docs/DESIGN.md               # technical spec (design decisions)
├── ui/                          # web UI (Hono + Vite + React) — comes in M2
├── manager/                     # manager agent — comes in M8
├── customizations/              # your customs (user-authored)
│   ├── skills/
│   ├── agents/
│   └── patches/
├── .ai-customizer/              # catalog config
│   ├── catalog.json             # schema version + name
│   └── triggers.json            # hook trigger vocabulary
└── application-guide.json       # patch composition order + active state
```

User state (outside the repo):
```
~/.config/ai-customizer/
├── config.json                  # catalogPath + UI settings
├── install-state.json           # tracker (what's installed)
├── history.json                 # audit log of applies
├── projects.json                # registered projects
├── hook-registry.json           # global hook registry
├── backups/                     # tar.gz rotativos (últimos 10)
└── .lock                        # lock file (concurrency guard)
```

## Roadmap

| Milestone | Version | Scope |
|---|---|---|
| M1 | v0.1.0 | Foundation + spec in repo (this commit) |
| M2 | v0.2.0 | UI scaffold, stack booteando en vacío |
| M3 | v0.3.0 | Read-only catalog browser |
| M4 | v0.4.0 | Settings + first-run wizard + lock file |
| M5 | v0.5.0 | Installer core (copy + jsonMerge) for skills/agents |
| M6 | v0.6.0 | Patches + application-guide |
| M7 | v0.7.0 | Hook system + registry |
| M8 | v1.0.0 | Manager agent + polish |

## Contributing

Early stage. If you're here before v1.0.0, probably as a collaborator — read [docs/DESIGN.md](docs/DESIGN.md) first.

## License

TBD.
