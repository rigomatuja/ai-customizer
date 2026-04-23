# AI Customizer

Customization manager for **Claude Code** and **Opencode**.

One git-versioned catalog of your customs (skills, agents, patches), a local
web UI to install and uninstall them atomically, and a manager agent that
writes the files for you when you ask.

**Status**: v1.1.0. Local-use stable. Linux and macOS supported.

---

## Contents

1. [How it fits together](#how-it-fits-together)
2. [Requirements](#requirements)
3. [Install](#install)
4. [Update](#update)
5. [First run](#first-run)
6. [Hello world](#hello-world)
7. [Daily workflow](#daily-workflow)
8. [Features and disk layout](#features-and-disk-layout)
9. [Concepts reference](#concepts-reference)
10. [Scripts and env vars](#scripts-and-env-vars)
11. [Troubleshooting](#troubleshooting)
12. [Not in v1](#not-in-v1)

---

## How it fits together

Three separate locations on your disk, three clear responsibilities:

```
┌──────────────────────────────┐    ┌──────────────────────────────┐    ┌──────────────────────────────┐
│  CATALOG  (this repo)        │    │  STATE  (one per machine)    │    │  TOOLS  (where they read)    │
│                              │    │                              │    │                              │
│  Where customs are AUTHORED. │    │  Where the UI tracks what    │    │  Where Claude and Opencode   │
│  Version-controlled by git.  │    │  is installed + history +    │    │  actually read their files   │
│  Safe to share or fork.      │    │  backups + registries.       │    │  from at runtime.            │
│                              │    │                              │    │                              │
│  <your-catalog>/             │    │  ~/.config/ai-customizer/    │    │  ~/.claude/                  │
│    customizations/           │    │    config.json               │    │    skills/<id>/SKILL.md      │
│    manager/                  │    │    install-state.json        │    │    agents/<id>.md            │
│    application-guide.json    │    │    history.json              │    │    CLAUDE.md (+.original)    │
│    .ai-customizer/           │    │    hook-registry.json        │    │                              │
│    ui/                       │    │    projects.json             │    │  ~/.config/opencode/         │
│                              │    │    backups/*.tar.gz          │    │    skills/<id>/SKILL.md      │
│                              │    │    .lock                     │    │    agent/<id>.md             │
│                              │    │                              │    │    AGENTS.md (+.original)    │
└──────────────────────────────┘    └──────────────────────────────┘    └──────────────────────────────┘
            ▲                                    ▲                                    ▲
            │ writes                             │ writes                             │ writes
            │                                    │                                    │
      ┌─────┴─────┐                        ┌─────┴─────┐                        ┌─────┴─────┐
      │  Manager  │                        │    UI     │                        │    UI     │
      │  (agent)  │                        │           │                        │  (Apply)  │
      └───────────┘                        └───────────┘                        └───────────┘
```

**Who writes what**:
- **Manager** (runs inside Claude/Opencode) → writes ONLY the catalog (creates, improves, versions customs).
- **UI** → writes ONLY the state dir and the tool dirs. Never touches custom content in the catalog except for toggling active flags in `application-guide.json` and `manifest.json.activeVersion`.
- **You** → anything you want. Edit the catalog directly if you prefer. Everything else is orchestration on top.

**Key facts**:
- The **catalog** is a git repo. You own every clone. Each clone is independent.
- The **state dir** is per machine, shared across every catalog on it. Switching catalogs reuses the state but points at new content.
- The **tool dirs** are what Claude / Opencode read. The UI is the only thing that should write to them on your behalf.

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

It IS your catalog. Every clone is a separate, independent catalog. The
folder name and location are yours — pick whatever fits your setup.

```bash
git clone <this-repo-url> my-catalog
cd my-catalog
```

After cloning, the catalog root is `<wherever-you-cloned>/my-catalog/`.
Remember that path — the UI shows it in Settings and the manager uses it
when it writes files.

### 2. Install and launch — one script

From the catalog root:

```bash
./install.sh
```

The installer checks prereqs (Node 20+, npm, git), runs `npm install` inside
`ui/`, then starts the dev server in the foreground. Ctrl+C to stop.

**Idempotent.** Re-running `./install.sh` while the UI is already up is a
no-op: it detects the bound port (3236 or 5256), prints the current URLs,
and exits 0. Rerun as many times as you want.

Two processes start concurrently:
- Hono API server on `http://127.0.0.1:3236`
- Vite + React dev server on `http://127.0.0.1:5256` (proxies `/api/*` to :3236)

Open `http://127.0.0.1:5256` in a browser.

**Prefer to do it by hand?**

```bash
cd ui
npm install
npm run dev
```

---

## Update

Pull the latest template files from the official upstream repo without
touching anything you've created locally:

```bash
./update.sh
```

**Upstream wins** for: `ui/`, `manager/`, `docs/`, `.claude/skills/`,
`.opencode/skills/`, `install.sh`, `update.sh`, `README.md`, `LICENSE`,
`.gitignore`. The scripts self-update as part of this list — once the
current process finishes, the next `./update.sh` invocation uses the
refreshed script.

**Never touched**: `customizations/**`, `application-guide.json`,
`.ai-customizer/triggers.json`, `.ai-customizer/catalog.json`.

The script adds an `upstream` git remote on first run (pointing at the
official repo), fetches `main`, and checks out each upstream path into your
working tree. After the checkout the updater runs `npm install` in `ui/`
(idempotent — fast no-op when the lockfile already matches) and then asks
`Launch the UI now? [Y/n]`. Answer `Y` to start the dev server, `N` to
exit and launch manually later (via `./install.sh` or `cd ui && npm run
dev`).

**Idempotent.** When upstream has no changes, the updater prints
`[i] Already up to date — no-op` and still offers to launch the UI
(unless one is already running). Review with `git diff`, then commit when
you're happy — the updater never commits for you.

If `manager/` changed, the script reminds you to reinstall the manager
from **Settings → Manager → Reinstall** inside the UI.

---

## First run

A 2-step wizard walks you through setup.

### Step 1 — Initialize

Creates `~/.config/ai-customizer/` (the **state dir**) with:

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

> **Note**: the state dir is **per machine, not per catalog**. Every clone
> you run on the same machine shares these files. If you switch catalogs,
> the UI reuses your tracker/history but points at new customs — so prior
> installs from the previous catalog will appear as orphans until you
> uninstall them. Most users keep one catalog per machine.

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

## Hello world

The fastest way to prove the loop works end-to-end, without the manager:

### 1. Hand-author a skill in the catalog

From your catalog root:

```bash
mkdir -p customizations/skills/hello/v1.0.0/claude
cat > customizations/skills/hello/manifest.json <<'EOF'
{
  "id": "hello",
  "name": "Hello",
  "description": "Says hi.",
  "type": "skill",
  "category": "demo",
  "scope": "global",
  "versions": [
    { "version": "1.0.0", "createdAt": "2026-04-22T00:00:00Z", "changelog": "init" }
  ],
  "activeVersion": "1.0.0"
}
EOF
cat > customizations/skills/hello/v1.0.0/claude/SKILL.md <<'EOF'
# Hello skill

When the user says "hi", respond with "hello, world".
EOF
```

### 2. See it in the UI

Refresh the **Catalog** tab in your browser. `hello` appears with badges
`skill`, `global`, `claude`.

### 3. Activate it

1. Click the card.
2. **Active** toggle → on.
3. **Target** → Global.
4. **Tools** → Claude.
5. **Save**.

### 4. Apply

**Apply** tab → click **Apply plan**. The plan shows:

```
Skill / agent operations (1)
  [install] skill:hello v1.0.0  target: global  tools: claude
    copy → ~/.claude/skills/hello/SKILL.md
```

Click **Apply plan**. Result: `success`.

### 5. Verify on disk

```bash
cat ~/.claude/skills/hello/SKILL.md
# Hello skill
# When the user says "hi", respond with "hello, world".
```

### 6. Uninstall

Back in **Catalog → hello detail**, toggle **Active** off → **Save** →
**Apply** tab → **Apply plan**. The plan now shows an `[uninstall]` op.
After Apply, the file is gone:

```bash
ls ~/.claude/skills/hello/
# ls: cannot access '~/.claude/skills/hello/': No such file or directory
```

The tracker and history both reflect the round-trip.

---

## Daily workflow

### Create a custom

Two routes.

**Route A — via the manager (recommended).**

1. Open Claude Code or Opencode.
2. **Claude**: type `/manager` to invoke the `ai-customizer-manager`
   subagent. The primary does NOT auto-invoke by intent match — the
   slash command is the only trigger.
3. **Opencode**: Tab to the **AI Customizer Manager** primary agent.
4. The manager drives the conversation. Beyond the base questions
   (name, category, scope, target tools, hook triggers, dependencies)
   it also:
   - **Infers the project from `cwd`** when you pick `scope = project`
     (runs `pwd` + `git config --get remote.origin.url`) and proposes
     `{ name, path, repoUrl }` for you to confirm or correct.
   - **Auto-detects patch regions** by reading the baseline
     (`<master>.original`, or the current master if no `.original`
     exists yet) and proposing candidate before/after snippets — you
     confirm; you never have to paste regions yourself.
   - **Detects gentle-ai** via `<!-- gentle-ai:<tag> -->` markers in
     your `CLAUDE.md` / `AGENTS.md`. If found, it offers those tags
     as selectable dependencies; if not, it refuses to wire
     `dependencies.gentleAi`.
   - **When creating agents**, walks a 9-dimension checklist
     (triggers, role, scope, procedure, tools, delegation, input,
     output, failures, anti-patterns) before writing — one dimension
     per question.

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

**`.original` lifecycle** — this is the core of idempotent patches:

- **Created**: on the first Apply that installs ANY patch for a master file,
  the installer snapshots the master as `<master>.original`. The snapshot
  captures whatever content was there (default Claude/Opencode content, or
  your prior edits).
- **Reused**: every subsequent Apply on that master composes patches
  starting from `.original`, never from the live master. This means two
  patches produce the same result regardless of the order patches were
  enabled/disabled in between.
- **Never auto-deleted**: removing all patches restores the master to
  `.original` content, but the `.original` file stays on disk. This keeps
  future patch composition deterministic.
- **Manually deletable**: you can delete `.original` yourself to "rebase"
  onto a new baseline (for example, after a Claude update changed the
  default master). The next patch install will snapshot the new current
  content as the fresh baseline.

### Application Guide

The recipe that tells the installer which patches to apply to which master,
in which order. Lives in the catalog:

```
application-guide.json
```

Shape:

```json
{
  "schemaVersion": "1.0",
  "targets": {
    "CLAUDE.md": [
      { "patchId": "strict-testing", "version": "1.2.0", "active": true,  "order": 0 },
      { "patchId": "voseo-off",       "version": "2.0.1", "active": false, "order": 1 }
    ],
    "AGENTS.md": []
  }
}
```

**How entries land in the guide**: manually (you or the manager adds a
patch via "Add from catalog" in the Guide tab) or implicitly when you
add a patch and toggle it on.

**The Guide tab** of the UI lets you:
- Reorder entries with ↑ / ↓ buttons — order matters when two patches
  touch overlapping regions.
- Toggle `active` per entry — inactive entries stay in the guide but
  don't get applied.
- Change the `version` referenced by each entry (to install a different
  version of the same patch).
- Remove entries entirely.

Every change to the guide is a write to `application-guide.json` in the
catalog. It does NOT touch the master file until you run Apply.

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

The registry is regenerated atomically on every Apply.

**Who reads it**: any agent that wants to fire hooks — typically an
orchestrator you install alongside (for example, the gentle-ai SDD
orchestrator reads both the project registry at `<project>/.atl/hook-registry.json`
and the global one). **The UI itself does not fire hooks** — it only
maintains the registry as a side-effect of Apply. Firing is 100% the
consumer's job.

A consumer typically:
1. Walks up from cwd looking for `<project>/.atl/hook-registry.json`.
2. Reads `~/.config/ai-customizer/hook-registry.json` as well.
3. Merges both lists (project wins on conflict).
4. Filters by `triggers[].type` and `triggers[].target` for the event
   it is about to emit.
5. Invokes the matching skill/agent (at `installedPath`) with its own
   delegation mechanism.

**Trigger vocabulary** lives in the catalog:

```
.ai-customizer/triggers.json
```

Editable from the **Triggers** tab. The planner warns on unknown triggers in
a manifest (non-blocking). Wildcards are supported: `agent-event:*:complete`
matches `agent-event:sdd-apply:complete`.

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

### Gentle AI integration

The UI scans your masters (`~/.claude/CLAUDE.md` and
`~/.config/opencode/AGENTS.md`) for HTML comment markers of the form
`<!-- gentle-ai:<tag> -->` and surfaces the result in **Settings →
Gentle AI integration**.

- If any markers are found: gentle-ai is considered installed and the
  manager offers those tags as selectable dependencies when you author
  a custom (auto-filling `dependencies.gentleAi` + `dependencies.customs`).
- If no markers are found: the manager refuses to wire gentle-ai deps.

The tag format is an open convention — any `<!-- gentle-ai:<alphanumeric_-> -->`
comment counts. The detection endpoint is `GET /api/tools/gentle-ai`.

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
| `PORT` | `3236` | Override Hono server port |
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

**How do I reset the state dir?**
Stop the UI. Delete `~/.config/ai-customizer/` (optionally keep
`backups/` first). Start the UI again → the wizard runs fresh. Any tool
files that were installed stay on disk but become invisible to the UI
(they'd show up as orphans if you re-register the same catalog).

**How do I start over with a fresh catalog?**
The safest order:
1. In the UI, uninstall all active customs (toggle all off → Apply).
2. Uninstall the manager (Settings → Manager → Uninstall).
3. Close the UI.
4. `rm -rf ~/.config/ai-customizer/` (or just `install-state.json` +
   `history.json` if you want to keep backups).
5. Clone a fresh catalog somewhere else, `./install.sh`, run the wizard.
   New state dir, new catalog, no leftovers.

**How do I update the manager after a template pull?**
After `./update.sh` (or a manual `git pull`) in the catalog, the manager
folder may have a new version. Settings → Manager shows a version mismatch
indicator. Click **Reinstall** to overwrite the old manager files with the
new version. Atomic: snapshots prior content, rolls back on any per-tool
copy failure.

**Where are past Apply backups?**
`~/.config/ai-customizer/backups/apply-YYYYMMDD-HHMMSS.tar.gz`. Last 10
kept, FIFO. To restore: `tar -xzf <backup> -C /` restores the captured
tool dirs to their absolute paths.

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
- Two UIs / two catalogs active simultaneously (lock file prevents; you
  can only run one UI instance at a time per machine).

See `docs/DESIGN.md` §12 for the full list and rationale.

---

## License

TBD.
