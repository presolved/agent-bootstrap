---
name: merge
description: Land the current branch — open (or reuse) its pull request, wait for CI to go green, fix any failures, and squash-merge once everything passes. Use when asked to "merge", "land this", "open a PR and merge when green", or "ship the branch". Manual invocation via `/merge [base-branch] [--no-merge]`.
---

## User Input

```text
$ARGUMENTS
```

# Merge Skill

1. Read `~/.agent-shared/docs/global-engineering.md`.
2. Read `~/.agent-shared/docs/merge-workflow.md`.
3. Read repo `CLAUDE.md`, `AGENTS.md`, and `docs/constitution.md` when present, plus any git/PR wiki page for the project.
4. Parse the user input: optional base branch, optional `--no-merge`; anything else is context for the PR body.
5. Execute the workflow steps 1 → 5 yourself. Do not delegate the loop to a subagent, and never claim a check passed without reading its result.
6. Report as the workflow describes.

## Rules

- Repository instructions override home-level defaults, including the merge method.
- Wait for CI with `run_in_background` or the Monitor tool, watching runs by id; never with foreground sleep loops.
- The workflow's "Never" list is absolute: no pushes to the base, no merging on red or pending checks, no `--no-verify` or `--admin`.
