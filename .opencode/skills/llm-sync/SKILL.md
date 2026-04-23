---
name: llm-sync
description: Keep docs/llm.md — the single-file briefing for any AI agent working on this repo — authoritative after ANY system change. Covers schemas, endpoints, flows, invariants, scripts, manager protocol, UI and API conventions, versions, gotchas. Load on any modification to functional code, catalog config, scripts, docs, or skills.
---

<!--
  Opencode ignores the `paths` frontmatter field (Claude Code-only).
  This skill auto-activates in Claude Code via paths matching; in
  Opencode it matches semantically via the `description` field only.
  Invoke manually if Opencode does not surface it.
-->


# LLM sync

## When I'm loaded

Claude Code loads me automatically on ANY modification to the template's
functional code or docs, because `docs/llm.md` is the canonical
single-file briefing that any AI agent reads when it sits down to work
on this repo. If something ships and llm.md doesn't reflect it, the
next agent is flying blind.

My scope is deliberately broader than readme-sync: not every change
touches README, but almost every change touches llm.md.

## Execution rule

This is a **must-run-to-completion** protocol. Treat llm.md updates as
part of the change, not as optional follow-up. A commit that modifies
behavior without updating llm.md is incomplete.

## What I do

After you modify anything in the paths above:

1. Open `docs/llm.md`.
2. Identify which section(s) your change affects (see table below).
3. Apply the smallest precise edit that keeps the section accurate.
4. If a cross-reference points at a section that moved, fix the
   reference.
5. Bump version strings if shifted (§12 lists the three canonical
   locations — UI version string, server index.ts health endpoint,
   README status line).
6. Re-read the section end-to-end: prose must still flow.

## Change → section map

| Change | llm.md section(s) |
|---|---|
| Zod schema edit in `ui/src/shared/schemas.ts` | §5 Core concepts (glossary + semantics) |
| New/changed API endpoint | §8 API surface (table) |
| Planner validation change | §6 Invariants, §11.3 Failure modes |
| Patch composer change | §6.3, §7.2 |
| Backup behavior change | §7.1 Apply pipeline, §19 Gotchas |
| Manager behavior change | §10 The manager agent, especially §10.4 (version-notes block) |
| Install / uninstall / upgrade flow | §7 Flow deep-dives |
| New env var | §14 Environment variables |
| New gotcha discovered | §19 Gotchas |
| Script change (install.sh / update.sh) | §13 Scripts |
| Version bump | top-level status, §12 Release and versioning |
| New system skill added | System skills section (see §20 "Quick navigation" for pointer; create if absent) |

## Verification after edit

Before claiming done:

1. `grep -oE '§[0-9]+(\.[0-9]+)?'` the file — every cross-ref must
   point at a heading that still exists.
2. If you added a new section, add a matching entry to the Table of
   contents at the top.
3. If you bumped a version, grep for all references to the old
   version string and update them.
4. §21 "Where this document is out of date" lists verification
   shortcuts — use them when unsure.

## Rules

- llm.md is DENSE by design. Don't pad. If you're about to write
  "furthermore", "additionally", or "it is worth noting", cut it.
- Every factual claim must be verifiable against the code. Don't add
  speculation or future plans.
- When in doubt whether a detail is important, ask: "would an agent
  acting on this sentence do something wrong?" If yes, include it.
- Never invent section numbers. Read the file first to know the
  current structure.
- Maintain the numbered-section convention (§0–§21 plus subs).
- Match the doc's prose register: second-person imperative for rules,
  third-person descriptive for facts.

## Anti-patterns

- Duplicating large chunks of code into llm.md. Point to the file and
  summarize.
- Writing prose when a table would do.
- Adding a new section for a one-off detail. Find the right existing
  home first.
- Silently dropping a section the change made irrelevant — delete it
  explicitly and note it in the commit.

## References

- Target file: `docs/llm.md`
- Its own §21 "Where this document is out of date" — lookup shortcuts
  for verifying claims against code.
- Sibling skill: `.claude/skills/readme-sync/SKILL.md` for the
  user-facing README.
