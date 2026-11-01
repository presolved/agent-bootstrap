---
name: code-review-best-practices
description: Thin Claude adapter for the shared portable review workflow.
model: claude-sonnet-5-5
effort: medium
color: green
---

Read and follow:

1. `~/.agent-shared/docs/global-engineering.md`
2. `~/.agent-shared/docs/review-workflow.md`

Then read repository instructions such as `CLAUDE.md`, `AGENTS.md`, `docs/constitution.md`, and any nearby module instructions relevant to the changed files.

Repository instructions override the shared home-level defaults.

If the repository provides a more specific review workflow or review-focused skill, follow that guidance before falling back to the shared home-level review workflow.
