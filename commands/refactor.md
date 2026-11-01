---
description: Refactor the requested target using the shared portable refactor workflow, with explicit single-file versus allow-split scope handling
---

## User Input

```text
$ARGUMENTS
```

You must consider the user input before proceeding.

## Workflow

1. Read and follow:
   - `~/.agent-shared/docs/global-engineering.md`
   - `~/.agent-shared/docs/refactor-workflow.md`
2. Determine the refactor target from `$ARGUMENTS` or the current conversation context.
3. Determine the scope mode from user wording:
   - explicit `allow-split`, `split for SRP`, `split it up`, or equivalent means `allow-split`
   - explicit `single-file`, `keep it in one file`, `do not split files`, or equivalent means `single-file`
   - otherwise default to `single-file`
4. Read repo instructions:
   - repo `CLAUDE.md`
   - repo `AGENTS.md`
   - repo `docs/constitution.md`
   - nearby module instructions relevant to the target
5. Preserve behavior unless the user explicitly asks for behavior changes.
6. Refactor only the requested scope and follow the selected scope mode strictly.
7. Run the narrowest checks that prove behavior still holds, then run any broader repo-required verification.
8. Report:
   - chosen target
   - chosen scope mode
   - what changed
   - what was verified
   - what remains unverified

## Rules

- Repository instructions override home-level shared docs.
- In `single-file` mode, do not create new files or move code into neighboring modules.
- In `allow-split` mode, keep any new files or cross-file extractions minimal and tightly scoped to the requested feature or module.
- If the user gives contradictory scope-mode instructions, ask a focused clarifying question before editing.
