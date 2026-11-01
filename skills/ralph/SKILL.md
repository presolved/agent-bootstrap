---
name: ralph
description: Start a Ralph Wiggum autonomous development loop. Runs planning or build loops that iterate until completion using the external bash loop methodology.
---

# Ralph Wiggum Loop

Start an autonomous Ralph loop in the current project directory. This invokes the external
bash loop that runs Claude Code repeatedly until the task is complete.

## Usage

- `/ralph` - Run build mode (default 10 iterations)
- `/ralph plan` - Run planning mode (default 10 iterations)
- `/ralph plan 5` - Run planning mode with max 5 iterations
- `/ralph 20` - Run build mode with max 20 iterations

## Prerequisites

Before running, ensure:
1. `~/.local/bin/ralph` exists and is executable
2. The current directory has either:
   - A `specs/` folder with specification files, OR
   - An existing `IMPLEMENTATION_PLAN.md`

## Workflow

### Planning Mode (`/ralph plan`)

1. Reads specs from `specs/*`
2. Analyzes existing codebase
3. Creates/updates `IMPLEMENTATION_PLAN.md` with prioritized tasks
4. Does NOT implement anything

### Build Mode (`/ralph` or `/ralph [n]`)

1. Reads `IMPLEMENTATION_PLAN.md`
2. Picks the highest priority task
3. Implements it using TDD
4. Runs tests for validation
5. Commits changes
6. Updates `IMPLEMENTATION_PLAN.md`
7. Repeats until complete or max iterations reached

## Execution

When invoked, parse the arguments and run:

```bash
~/.local/bin/ralph [mode] [iterations]
```

**Warning**: This runs with `--dangerously-skip-permissions`, meaning Claude will have
full autonomy. Always use a reasonable iteration limit.

## Important Notes

- Each iteration is a fresh Claude session
- State persists via `IMPLEMENTATION_PLAN.md` and git
- Set reasonable max iterations (10-50) to control costs
- Review generated code before merging to main
