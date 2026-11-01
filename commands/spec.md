---
description: Run the spec phase as a context-extraction discussion that produces a high-level spec file. Supports new specs, resuming an existing spec, and reviewing a spec authored elsewhere via `/spec review [path]`.
---

## User Input

```text
$ARGUMENTS
```

You must consider the user input before proceeding.

## Workflow

Follow `~/.agent-shared/docs/spec-workflow.md`.

Resolve the mode from `$ARGUMENTS`:

- `review [path]` — **Review mode.** Use the given spec path; when omitted, infer it from the current branch or recently changed files and confirm with the user.
- A reference to an existing spec (path, feature number, or slug) — **Resume mode.**
- Anything else — **New mode**; treat the remaining input as the idea description.

Claude-specific accelerators (never dependencies):

- Use the structured question tool (`AskUserQuestion`) for intake and clarification rounds when available — maximum 4 questions per call, concrete options derived from research, recommended option first. Fall back to plain chat questions otherwise.
- Use browser or MCP tools for research when they help, but keep all durable output in the spec file.

## Rules

- Repository instructions (`CLAUDE.md`, `AGENTS.md`, `docs/constitution.md`) override home-level shared docs.
- Propose the inferred `specs/NNN-slug/spec.md` path before writing it. Never create or switch branches — the user manages git state.
- Encode every clarification answer into both the spec body and the dated `## Clarifications` session log.
- Park implementation details in `.context/plan-notes-<NNN-slug>.md`; record load-bearing deferrals as clarification entries so they survive in the committed spec.
- End the spec phase with the adversarial pass; do not generate a checklist artifact.
