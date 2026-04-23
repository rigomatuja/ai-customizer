---
name: manager-sync
description: Manager protocol version-bump procedure for the AI Customizer — create manager/vX.Y.Z/, mirror Claude and Opencode bodies, update manifest.json, update docs/llm.md §10, verify section numbering, test via Settings → Manager → Reinstall. Load when editing anything under manager/ or when touching the manager-install installer or routes.
---

<!--
  Opencode ignores the `paths` frontmatter field (Claude Code-only).
  This skill auto-activates in Claude Code via paths matching; in
  Opencode it matches semantically via the `description` field only.
  Invoke manually if Opencode does not surface it.
-->


# Manager sync

## When I'm loaded

Claude Code loads me automatically when you edit anything under
`manager/`, `ui/src/server/installer/manager-install.ts`,
`ui/src/server/routes/manager.ts`, or `ui/src/client/pages/Settings.tsx`
(the Manager panel lives there). My job: make sure any change
affecting the manager's flow follows the full version-bump procedure —
no in-place edits, no dropped Opencode mirror, no stale manifest.

## Execution rule

This is a **must-run-to-completion** protocol. The manager is a
versioned, factory-protected artifact. "Just a small fix" on the live
version is the wrong mental model; every behavioral change is a new
version.

## Core invariant

**Never mutate an existing `manager/vX.Y.Z/` folder.** Every behavioral
change creates a NEW version folder. This is the only way to keep
installed managers deterministic for users on any older version.

## Version bump procedure (mandatory)

When the manager's body, slash command, or protocol changes:

### 1. Decide the bump level

- **Patch** (e.g., 0.2.0 → 0.2.1): typo, wording, clarified rule.
- **Minor** (0.2.0 → 0.3.0): additive — new paso, new step, new
  optional behavior.
- **Major** (0.2.0 → 1.0.0): breaking — removed paso, changed required
  behavior, renamed anchor.

### 2. Create the new folder

```
manager/vX.Y.Z/
├── claude/
│   ├── manager.md          # the subagent body
│   └── slash-command.md    # the /manager slash command
└── opencode/
    └── manager.md          # the primary-agent body
```

Copy from the previous version as a starting point — never edit the
old one in place.

### 3. Apply the behavioral change to BOTH Claude and Opencode bodies

The two bodies are ~99% identical. Diff them first to confirm current
state:

```bash
diff manager/v<current>/claude/manager.md manager/v<current>/opencode/manager.md
```

The expected diff is ONLY the frontmatter block + the "0.2 — Mode per
tool" bullets. Anything else is accidental drift and must be
reconciled.

### 4. Update `manager/manifest.json`

- Append a new entry to `versions[]` with `version`, `createdAt`
  ISO-8601 timestamp, and a concrete `changelog` string.
- Set `activeVersion` to the new version.
- Do NOT remove old entries.

### 5. Update `docs/llm.md` §10

- Bump `§10.1` activeVersion line.
- Add a `§10.N v<version> protocol additions` block listing the
  changes against the prior version.

### 6. Verify section numbering in the bodies

If you inserted a new `## <N>.<M>` section, you MUST renumber every
`## <N>.<K>` where `K > M` AND every cross-ref to those sections. Run:

```bash
grep -nE '^## [0-9]+\.[0-9]+' manager/vX.Y.Z/claude/manager.md
grep -oE '§?[0-9]+\.[0-9]+' manager/vX.Y.Z/claude/manager.md | sort -u
```

Every numbered heading must be referenced consistently.

### 7. Test on a clone, not the template itself

- Update the clone via `./update.sh`.
- Settings → Manager → Reinstall (picks up the new version per the
  manifest).
- Invoke `/manager` on Claude OR Tab-select "AI Customizer Manager"
  on Opencode.
- Exercise the changed paso end-to-end.

## Frontmatter invariants

Claude subagent frontmatter:
```yaml
---
name: ai-customizer-manager
description: Invoked ONLY via the `/manager` slash command. [...]
---
```
The `description` explicitly says "ONLY via /manager" so the primary
does not auto-invoke on intent match. Do NOT soften this unless you
are also updating the expected behavior in docs.

Opencode primary frontmatter:
```yaml
---
name: AI Customizer Manager
description: Creates, improves, versions, and classifies customs in the AI Customizer catalog.
mode: primary
---
```
`mode: primary` is required — it makes the agent Tab-selectable in
the Opencode TUI.

Slash command frontmatter (Claude only, `manager/vX.Y.Z/claude/slash-command.md`):
```yaml
---
description: AI Customizer Manager — create, modify, or version a custom in your catalog
---
```

## The installer side

If your change also affects how the manager is installed on disk
(new asset per tool, different paths, different idempotency), touch
`ui/src/server/installer/manager-install.ts`:

- Update `managerAssets()` if the asset list changed. Current:
  2 assets for Claude (agent + slash-command), 1 asset for Opencode
  (agent only).
- Preserve the snapshot-rollback pattern: capture pre-existing content
  before copying, restore on failure.
- The tracker ops for manager use `customType: 'agent'`,
  `customId: 'manager'`. The planner EXCLUDES these from its diff
  (`planner.ts::trackerInstallsFor`). Do NOT change this unless you
  also update the planner exclusion — otherwise the manager gets
  deleted on the next regular Apply (historical bug).

## Rules

- **Never** edit a historical version folder.
- **Never** port a change to one tool without the other unless the
  change is genuinely tool-specific (e.g., slash command shape).
- **Never** delete an old version from `versions[]` — users on older
  versions rely on that metadata.
- **Never** bump `activeVersion` without creating the matching folder
  first.
- **Always** verify section numbering after adding a new paso or
  sub-paso.

## Anti-patterns

- Small fixes done "just on Claude's copy" — they drift.
- Forgetting the `docs/llm.md §10` update — the AI-agent briefing
  goes stale instantly.
- Editing the slash-command.md in place — it IS a versioned asset
  and gets the new version folder's copy.
- "Hot-fixing" the live manager by tweaking the installed
  `~/.claude/agents/manager.md` on disk — that is a user-dir file
  that the UI overwrites on the next Reinstall. Fix the catalog
  source and Reinstall.

## References

- Current manager: `manager/v0.2.0/{claude,opencode}/manager.md`.
- Slash command: `manager/v0.2.0/claude/slash-command.md`.
- Manifest: `manager/manifest.json`.
- Installer: `ui/src/server/installer/manager-install.ts`.
- Route: `ui/src/server/routes/manager.ts`.
- AI agent briefing §10: `docs/llm.md`.
- Sibling skill for the broader briefing: `.claude/skills/llm-sync/SKILL.md`.
