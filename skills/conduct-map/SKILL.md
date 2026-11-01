---
name: conduct-map
description: Work an entire wayfinder map from one orchestrator session — dispatch each frontier ticket to its own Conductor tab in this workspace, watch the tracker, and advance until the map is done.
disable-model-invocation: true
---

# Conduct-Map Skill (Claude adapter)

Thin Claude adapter for the shared portable conduct-map workflow.

Read and follow:

1. `~/.agent-shared/docs/global-engineering.md`
2. `~/.agent-shared/docs/conduct-map-workflow.md`

Then read repository instructions such as `CLAUDE.md`, `AGENTS.md`, and `docs/constitution.md` when they exist. Repository instructions override the shared home-level defaults.

Claude-specific notes:

- For the watch loop, use the Monitor tool or a `run_in_background` Bash `until` loop; foreground `sleep` is blocked in this harness.
- Track dispatch/watch phases with TaskCreate/TaskUpdate so progress is visible.
