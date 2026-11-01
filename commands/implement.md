---
description: Implement the active plan as a portable single-agent workflow with repo-native verification and shared .context handoff files
---

## User Input

```text
$ARGUMENTS
```

You must consider the user input before proceeding.

## Workflow

1. Assume the active plan is already present in conversation context.
2. If `$ARGUMENTS` includes an explicit markdown path, read that file and use it as the plan source instead.
3. Read the plan, then read repo `CLAUDE.md`, `AGENTS.md`, and `docs/constitution.md` when present.
4. If the plan or verification steps require browser login or sign-in, open the relevant login page with browser tools first, then ask the user to complete authentication before continuing.
5. If the plan or verification steps require non-browser prerequisites such as tokens or manual credentials, stop and ask the user to complete them before continuing.
6. Break the plan into a concrete sequential task list if it is not already task-oriented.
7. Implement one coherent task at a time. After each task:
   - run the narrowest useful verification
   - record a milestone in repo `.context/progress.md`
8. Run broader repository verification before concluding, using repo-native commands and task runners where available.
9. Before yielding, update repo `.context/handoff.md` with:
   - goal
   - current status
   - files touched
   - checks run
   - checks still needed
   - open questions
   - next recommended step

## Rules

- Repository instructions override home-level shared docs.
- Do not depend on Claude-only hooks, plugins, or agent-team features to complete the workflow.
- Use repo `.context/` files as the shared handoff state instead of tool-private memory.
