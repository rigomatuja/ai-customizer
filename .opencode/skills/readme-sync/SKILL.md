---
name: readme-sync
description: Keep the user-facing README.md in sync with reality after any change that affects what README describes — install/update scripts, UI version, features visible to users, env vars, troubleshooting cases, or the list of things "not in v1". Load when editing README.md, install.sh, update.sh, ui/package.json, or ui/src/server/index.ts.
---

<!--
  Opencode ignores the `paths` frontmatter field (Claude Code-only).
  This skill auto-activates in Claude Code via paths matching; in
  Opencode it matches semantically via the `description` field only.
  Invoke manually if Opencode does not surface it.
-->


# Readme sync

## When I'm loaded

Claude Code loads me automatically when you edit README.md directly, or
when you touch one of the scripts / version files that README describes.
My job is to keep README.md in sync with reality — a user reading the
README after your change should get the same story as a user running
the system.

## Execution rule

This skill is a **must-run-to-completion** protocol on the listed
triggers. Do NOT finish a change to any of those files without sweeping
README and fixing whatever is stale.

## What I do

On every triggering change:

1. Scan what changed. For each changed file/concept, ask: does README
   mention this? If yes → which section?
2. Read those sections. Compare current prose vs. current reality.
3. Edit README. Preserve section structure and tone (imperative,
   concise, minimal fluff).
4. Version line: if the UI version (ui/package.json, server/index.ts
   health endpoint) changed, update the status line at the top
   (`**Status**: vX.Y.Z. Local-use stable. ...`).

## README sections and what triggers each

| Triggered by | README section(s) |
|---|---|
| New/changed feature visible to users | Features and disk layout, Concepts reference |
| New/changed API endpoint (publicly relevant) | Scripts and env vars, Features |
| Script changes (install.sh / update.sh) | Install, Update |
| Changed wizard flow | First run |
| New/changed env var | Scripts and env vars |
| New troubleshooting case found | Troubleshooting |
| UI version bump | **Status** line at the top |
| Manager version bump | How it fits together (if the manager's role changed) |
| Feature added/removed from v1 | Not in v1 |

## Rules

- **Never** write "this will" or "we plan to" — README describes what
  exists, not what will exist.
- Preserve the existing tone: short sentences, bullets over prose,
  concrete paths over abstractions.
- Use absolute home paths (`~/.claude/...`) not placeholders
  (`<home>/.claude/...`) — README is user-facing.
- Don't invent section numbers; README uses named sections, not
  numbered ones.
- If a change removes a feature, delete the README section; don't
  leave "deprecated" stubs.

## Anti-patterns

- Adding a "Changelog" section to README. Releases go on GitHub tags.
- Marketing copy: "powerful", "seamless", "blazing fast".
- Code blocks longer than ~15 lines — link to docs/DESIGN.md or
  docs/llm.md instead.
- Duplicating content that already lives in docs/DESIGN.md or
  docs/llm.md. Link instead.

## Verification after edit

1. Re-read the README sections you touched — prose still flows, no
   orphan sentences.
2. Cross-check the TOC: if you added/removed a section, the TOC at
   the top must match.
3. Status line: if you bumped the version, verify all three canonical
   locations match (README status, ui/package.json, ui/src/server/index.ts
   health endpoint).

## References

- Current README: `README.md`
- Design spec: `docs/DESIGN.md`
- AI agent briefing: `docs/llm.md`
- Sibling skill for the briefing: `.claude/skills/llm-sync/SKILL.md`
