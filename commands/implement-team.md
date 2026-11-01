---
description: Optional Claude-only accelerator that coordinates multiple agents while preserving the shared portable implementation workflow
---

## User Input

```text
$ARGUMENTS
```

You must consider the user input before proceeding.

## Workflow

1. Start by following the same plan-in-context assumption, repo instruction loading, auth checks, browser-login handling, and handoff rules as `~/.agent-shared/docs/implement-plan-workflow.md`.
2. Use agent teams only as an accelerator for independent tasks. Do not make team state the source of truth.
3. Assign independent implementation tasks in parallel, then converge on one shared review and verification pass.
4. Run the same repo-native verification expected by the portable single-agent workflow before concluding.

## Rules

- This command is optional and Claude-specific.
- The final behavior, review standards, and verification expectations must match the portable single-agent workflow.
