# AI Customizer

Customization manager for **Claude Code** and **Opencode**.

One git-versioned catalog of your customs (skills, agents, patches), a local
web UI to install and uninstall them atomically, and a manager agent that
writes the files for you when you ask.

**Status**: v1.0.4. Local-use stable. Linux and macOS supported.

---

## Contents

1. [Requirements](#requirements)
2. [Install](#install)
3. [First run](#first-run)
4. [Daily workflow](#daily-workflow)
5. [Features and disk layout](#features-and-disk-layout)
6. [Concepts reference](#concepts-reference)
7. [Scripts and env vars](#scripts-and-env-vars)
8. [Troubleshooting](#troubleshooting)
9. [Not in v1](#not-in-v1)

---

## Requirements

- **Node.js 20 or newer** (LTS 22 recommended).
- **npm** (ships with Node).
- **git** (for cloning and versioning your catalog).
- **Claude Code and/or Opencode** installed locally.
  - Claude reads from `~/.claude/`.
  - Opencode reads from `~/.config/opencode/`.

Tested on Linux and macOS. Windows is not supported in v1 (path and rename
semantics differ; see [Not in v1](#not-in-v1)).

---

## Install

### 1. Clone this repo

It IS your catalog. Every clone is a separate catalog. You own it.

```bash
git clone <this-repo-url> my-catalog
cd my-catalog
```

### 2. Install the UI

```bash
cd ui
npm install
```

### 3. Launch

```bash
npm run dev
```

This starts two processes concurrently:
- Hono API server on `http://127.0.0.1:3000`
- Vite + React dev server on `http://127.0.0.1:5173` (proxies `/api/*` to :3000)

Open `http://127.0.0.1:5173` in a browser.

---

## First run

A 2-step wizard walks you through setup.

### Step 1 — Initialize

Creates `~/.config/ai-customizer/` with:

| File | Purpose |
|---|---|
| `config.json` | catalog path + per-tool overrides |
| `install-state.json` | tracker — what the UI has put on disk |
| `history.json` | audit log of every Apply |
| `projects.json` | registered projects (for project-scoped installs) |
| `hook-registry.json` | global hook registry (regenerated on each Apply) |
| `backups/` | tar.gz of your tool dirs before each Apply (FIFO, last 10) |
| `.lock` | single-instance lock file |

Also detects `claude` and `opencode` on `$PATH` + their config dirs.

### Step 2 — Install the manager

The **manager agent** is a special custom shipped with this catalog
(in `manager/`). It lives globally inside Claude/Opencode and helps you
create new customs by asking questions and writing files correctly.

On disk after this step:

```
~/.claude/agents/manager.md                    # if you selected Claude
~/.config/opencode/agent/manager.md            # if you selected Opencode
```

You can skip this step and install it later from **Settings → Manager**.

---

## Daily workflow

### Create a custom

Two routes.

**Route A — via the manager (recommended).**

1. Open Claude Code or Opencode.
2. **Claude**: the primary invokes the `ai-customizer-manager` subagent when
   you ask things like *"create a skill for reviewing API endpoints"* or
   *"add a patch to my CLAUDE.md that enforces voseo"*.
3. **Opencode**: Tab to the **AI Customizer Manager** primary agent.
4. The manager asks: name, category, scope (global/project), target tools,
   hook triggers if any, dependencies. Then writes the files.

After the manager finishes, the new custom lives under
`customizations/<type>/<id>/` and shows up in the UI on refresh.

**Route B — hand-author.**

Create the files manually. Minimum shape:

```
customizations/skills/my-skill/
├── manifest.json
└── v1.0.0/
    ├── claude/SKILL.md
    └── opencode/SKILL.md
```

See `docs/DESIGN.md` §4 for the full schemas.

### Install a custom

1. **Catalog** tab → click the custom.
2. Toggle **Active**.
3. Pick **Target**: Global (default) or a registered Project.
4. Pick which tools to install into (default: all detected).
5. Click **Save**.
6. Go to **Apply** tab → review the plan → click **Apply plan**.

After Apply succeeds, the tool files exist on disk at their target paths
(see [Features and disk layout](#features-and-disk-layout)).

### Uninstall

Same path: toggle **Active** off → **Apply**. Files are removed, tracker is
updated, a tar.gz backup is kept for rollback.

### Upgrade (bump version)

Ask the manager to improve the custom. It adds a new version folder
(`v1.1.0/`, `v2.0.0/`) and bumps `manifest.json.activeVersion`. Your next
Apply removes the old version's files and installs the new.

---

## Features and disk layout

Each feature below shows:
- What the feature does
- What it writes in the **catalog** (this repo)
- What it writes on the **tool side** (`~/.claude/`, `~/.config/opencode/`)

### Skills

Markdown instructions loaded as context by the tool.

**Catalog:**
```
customizations/skills/<id>/
├── manifest.json
└── vX.Y.Z/
    ├── claude/SKILL.md          # optional per tool
    └── opencode/SKILL.md
```

**Tool side (global install):**
```
~/.claude/skills/<id>/SKILL.md
~/.config/opencode/skills/<id>/SKILL.md
```

**Tool side (project install):**
```
<project>/.claude/skills/<id>/SKILL.md
<project>/.opencode/skills/<id>/SKILL.md
```

### Agents

Invocable subagents (Claude) or primary/subagents (Opencode).

**Catalog:**
```
customizations/agents/<id>/
├── manifest.json
└── vX.Y.Z/
    ├── claude/<id>.md           # Claude subagent
    └── opencode/<id>.md         # Opencode agent with YAML frontmatter
```

**Tool side (global install):**
```
~/.claude/agents/<id>.md
~/.config/opencode/agent/<id>.md
```

**Tool side (project install):**
```
<project>/.claude/agents/<id>.md
<project>/.opencode/agent/<id>.md
```

### Patches

Idempotent find-and-replace overrides on the master files `CLAUDE.md` and
`AGENTS.md`. Multiple patches compose in order via the **Application Guide**.

**Catalog:**
```
customizations/patches/<id>/
├── manifest.json               # target: "CLAUDE.md" | "AGENTS.md" | "both"
└── vX.Y.Z/
    ├── claude/                  # if target includes CLAUDE.md
    │   ├── before.md            # exact substring to find
    │   └── after.md             # replacement
    └── opencode/                # if target includes AGENTS.md
        ├── before.md
        └── after.md
```

**Tool side (global, `target: both`):**
```
~/.claude/CLAUDE.md                           # composed result
~/.claude/CLAUDE.md.original                  # baseline, never touched
~/.config/opencode/AGENTS.md                  # composed result
~/.config/opencode/AGENTS.md.original         # baseline
```

The `.original` is a one-time snapshot of the master at the moment the first
patch was applied. Every future Apply composes from `.original`, so removing
all patches restores the master exactly.

**Application Guide** (catalog root):

```
application-guide.json           # { "targets": { "CLAUDE.md": [...], "AGENTS.md": [...] } }
```

Each entry: `{ patchId, version, active, order }`. The UI edits this file
when you reorder, toggle, or remove entries in the **Guide** tab.

### Hooks

Meta-tag on a skill or agent. Makes it auto-discoverable by an orchestrator
through a registry file. The manifest carries:

```json
"hook": {
  "triggers": [
    { "type": "phase",       "target": "sdd-pipeline:post-design" },
    { "type": "agent-event", "target": "sdd-apply:complete" },
    { "type": "procedure",   "target": "pre-pr-creation" }
  ],
  "onFail": "halt"
}
```

**Tool side (global registry):**

```
~/.config/ai-customizer/hook-registry.json
```

Example entry:

```json
{
  "customId": "my-reviewer",
  "customType": "skill",
  "version": "1.1.0",
  "tool": "claude",
  "scope": "global",
  "projectPath": null,
  "installedPath": "~/.claude/skills/my-reviewer/SKILL.md",
  "triggers": [...],
  "onFail": "halt"
}
```

**Tool side (project registry)**, for project-scoped hooks:

```
<project>/.atl/hook-registry.json
```

The registry is regenerated atomically on every Apply. Orchestrator agents
are expected to read it and fire hooks at matching phases or events.

**Trigger vocabulary** lives in the catalog:

```
.ai-customizer/triggers.json
```

Editable from the **Triggers** tab. The planner warns on unknown triggers in
a manifest (non-blocking).

### Projects

Register the local paths of projects you want to install project-scoped
customs into. Lives in `~/.config/ai-customizer/projects.json`. Managed from
**Settings → Known projects**.

A project entry `{ id, name, path, repoUrl }` is referenced by install
entries via `target: { scope: "project", projectId: "<uuid>" }`.

### Apply, tracker, history, backups

Every **Apply** runs this sequence:

1. Build a plan: diff desired state (installations + guide) against the
   tracker and filesystem.
2. Run validators: path collisions, unknown triggers, dependency closure
   (transitive + cycles), drift warnings, patch dry-run composition.
3. Hard-block if the plan has blockers.
4. Create a tar.gz backup of `~/.claude/`, `~/.config/opencode/`, and any
   affected project dirs.
5. Execute operations one by one, recording each in memory.
6. On success: commit the tracker atomically, append a history entry,
   regenerate the hook registry.
7. On failure: rollback executed operations in reverse (or restore from
   tar.gz if patches were involved), then append a history entry marking
   the failure.

**Tracker** (`~/.config/ai-customizer/install-state.json`):
```json
{
  "schemaVersion": "1.0",
  "catalogPath": "/home/you/my-catalog",
  "lastApply": "2026-...",
  "lastApplyResult": "success",
  "operations": [
    { "opId": "...", "type": "copy", "customId": "my-skill", "customType": "skill",
      "version": "1.1.0", "tool": "claude", "target": { "scope": "global" },
      "toPath": "~/.claude/skills/my-skill/SKILL.md", "contentHash": "sha256:..." }
  ],
  "patches": [
    { "opId": "...", "target": "CLAUDE.md",
      "masterPath": "~/.claude/CLAUDE.md",
      "originalBackup": "~/.claude/CLAUDE.md.original",
      "activeGuideHash": "sha256:...",
      "appliedContentHash": "sha256:..." }
  ]
}
```

**History** (`history.json`):
```json
{ "entries": [
  { "applyId": "...", "timestamp": "...", "result": "success",
    "installCount": 2, "upgradeCount": 0, "uninstallCount": 0, "patchCount": 1,
    "backupPath": "~/.config/ai-customizer/backups/apply-20260422-160238.tar.gz",
    "durationMs": 142 }
]}
```

**Backups** (`backups/`): one tar.gz per Apply, filename
`apply-YYYYMMDD-HHMMSS.tar.gz`, FIFO rotation keeps the last 10.

### Orphans

A custom is an **orphan** when it exists in the tracker but no longer in
the catalog (deleted, renamed, factory-reset). The UI shows them in
**Settings → Orphans** with a **Force uninstall** button.

- **Skill/agent orphan**: deletes installed files + clears tracker ops +
  drops any guide entries referencing the id.
- **Patch master orphan** (the guide references patches no longer in the
  catalog): restores the master from `.original`, clears `tracker.patches`,
  clears guide entries. If `.original` is missing, returns 409 and
  requires `?force=1` to proceed (so you don't accidentally lose
  recoverable state).

### Drift detection

On every Plan, the UI hashes each tracked file and compares to the
`contentHash` recorded at install time. Two non-blocking warnings:

- `drift-modified` — file was edited since install. Next Apply will
  overwrite your edits. Back them up first or accept.
- `drift-missing` — file was deleted since install. Apply will re-install.

### Manager

The manager agent is at `manager/vX.Y.Z/{claude,opencode}/manager.md` in the
catalog. It is **not** listed under `customizations/` because it is special
and protected from factory reset.

**Settings → Manager** shows install status per tool and offers install,
reinstall, uninstall. Install is atomic with snapshot rollback if any of
the per-tool copies fail.

---

## Concepts reference

| Concept | Where it lives | Who writes it |
|---|---|---|
| **Catalog** | this repo (you clone it) | You + the manager |
| **Custom** | `customizations/<type>/<id>/` | Manager (preferred) or you |
| **Manifest** | `customizations/<type>/<id>/manifest.json` | Manager |
| **Version** | `customizations/<type>/<id>/vX.Y.Z/` | Manager |
| **Application Guide** | `application-guide.json` | Manager + UI (toggle/order/remove) |
| **Trigger vocabulary** | `.ai-customizer/triggers.json` | Manager + UI |
| **Catalog meta** | `.ai-customizer/catalog.json` | Ships with template |
| **User config** | `~/.config/ai-customizer/config.json` | UI |
| **Tracker** | `~/.config/ai-customizer/install-state.json` | UI (executor) |
| **History** | `~/.config/ai-customizer/history.json` | UI (append-only) |
| **Hook registry (global)** | `~/.config/ai-customizer/hook-registry.json` | UI (regenerated on Apply) |
| **Hook registry (project)** | `<project>/.atl/hook-registry.json` | UI (regenerated on Apply) |
| **Backups** | `~/.config/ai-customizer/backups/*.tar.gz` | UI (pre-Apply) |
| **Lock file** | `~/.config/ai-customizer/.lock` | UI (on start) |
| **Tool files** | `~/.claude/…`, `~/.config/opencode/…`, `<project>/.claude/…`, `<project>/.opencode/…` | UI (only on Apply) |
| **Master .original** | `~/.claude/CLAUDE.md.original`, `~/.config/opencode/AGENTS.md.original` | UI (first patch Apply) |

---

## Scripts and env vars

Run from `ui/`:

```bash
npm run dev           # Hono server + Vite + React HMR (concurrently)
npm run server:dev    # only the server with hot reload
npm run start         # server only, no watch
npm run build         # typecheck + Vite build
npm run typecheck     # tsc --noEmit
```

Environment overrides:

| Var | Default | Purpose |
|---|---|---|
| `CATALOG_PATH` | parent of `ui/` | Override catalog root |
| `AIC_USER_CONFIG_DIR` | `~/.config/ai-customizer/` | Override user state dir |
| `PORT` | `3000` | Override Hono server port |
| `AIC_LOG_JSON` | unset | Set to `1` for line-delimited JSON logs |

---

## Troubleshooting

**UI won't start: "Could not acquire UI lock".**
Another instance is running, or a stale lock lingered after a crash. Check
`~/.config/ai-customizer/.lock` — if the PID inside is dead, delete the file.

**Plan shows `drift-modified` warnings.**
You edited an installed file manually. Either accept overwrite on next
Apply, or copy your edits back into the catalog (via the manager).

**Plan shows `patch-dry-run-failed`.**
A patch's `before.md` cannot be found in the current master. Likely another
patch ahead of it in the guide already modified that region. Reorder, fix
the conflict, or remove one of the patches.

**Apply result is `rolled-back` with `patch composition failed`.**
Same root cause as above but surfaced at execute time. Tar.gz backup
restored everything automatically.

**Orphan patch master won't force-uninstall (409 `restore-impossible`).**
The `.original` file is missing. Either restore it from a tar.gz backup
in `~/.config/ai-customizer/backups/`, or pass `?force=1` to accept that
the master will stay as-is (you may have committed content that was never
meant to survive).

**Project deletion blocked (409 `has-installations`).**
The project has customs installed in it. Uninstall them from Catalog first,
or pass `?force=1` on the DELETE to leave the files on disk.

**Manager install fails with "source and destination resolve to the same
path".**
Your `~/.claude/agents/manager.md` is a symlink pointing inside this
repo, or your catalog path is aliased through a symlink. Unsymlink it.

**Logs.**
Default human-readable to stderr. Set `AIC_LOG_JSON=1` for structured
line-delimited JSON that log aggregators can parse.

---

## Not in v1

Deferred features, documented so you know the shape of v2:

- Multi-target install (same custom installed in multiple projects at once).
- Named profiles (snapshots of active state you can switch between).
- Import/export individual customs as portable bundles.
- File watcher for catalog changes (manual page refresh for now).
- Diff viewer between custom versions.
- Schema migration tooling.
- Canonical template URL / "factory reset from origin".
- Project-scoped patches (patches are global-only today).
- Windows support.

See `docs/DESIGN.md` §12 for the full list and rationale.

---

## License

TBD.
