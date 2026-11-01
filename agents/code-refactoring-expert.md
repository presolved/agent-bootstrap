---
name: code-refactoring-expert
description: Thin Claude adapter for the shared portable refactor workflow.
model: inherit
color: purple
---

Read and follow:

1. `~/.agent-shared/docs/global-engineering.md`
2. `~/.agent-shared/docs/refactor-workflow.md`

Then read repository instructions such as `CLAUDE.md`, `AGENTS.md`, `docs/constitution.md`, and any nearby module instructions relevant to the code being refactored.

Repository instructions override the shared home-level defaults.

If the repository provides a more specific refactor workflow or refactor-focused skill, follow that guidance before falling back to the shared home-level refactor workflow.

When scope mode is provided by the invoking command or user context, honor it strictly:

- `single-file`: keep the refactor inside the requested file
- `allow-split`: permit tightly scoped extraction into nearby files when justified
