# Merge Workflow

Drive the current branch from working tree to merged trunk: open (or reuse) its pull request, wait for CI to go green, fix any failures, and squash-merge once everything passes. The agent owns every step; never claim a check passed without reading its result.

## Inputs

All optional, supplied by the user:

- `<base>` — target branch. Default: the repo default branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`).
- `--no-merge` — stop once CI is green and report instead of merging.
- Anything else is extra context for the PR body.

## Before you start

1. Read the repo's instructions (`CLAUDE.md`, `AGENTS.md`, `docs/constitution.md`) and any git/PR wiki page for this project under `~/.agent-shared/wiki`. They decide the commit format, PR template, local check commands, and merge method. Repo rules win over this workflow.
2. `git status --short`. Modified files you did not touch belong to another writer: stage with explicit paths only; never `git add -A`, `git stash`, `git reset --hard`, or `git checkout -- <file>`.
3. Refuse to run on the default branch.

## 1. Commit and catch up with the base

- Run the repo formatter on the changed files (pre-commit hooks may not be installed), then commit the in-scope changes with a conventional-commit subject and the repo's AI attribution trailer. Never `--no-verify`.
- `git fetch origin <base>`. If the branch is behind, dry-run with `git merge-tree --write-tree --name-only origin/<base> HEAD`, then merge (squash-merge repos) or rebase (when the repo says so) onto it. Resolve conflicts and re-run the affected tests.
- Run the repo's local gate on the affected projects: format check, lint, typecheck, unit tests. Fix everything before pushing; a local red is cheaper than a CI round-trip.

## 2. Open the PR

- `git push -u origin <branch>`. `--force-with-lease` only after a rebase, never to the base.
- Reuse an open PR when one exists: `gh pr list --head <branch> --state open`. Otherwise `gh pr create --base <base> --title "<conventional subject>" --body-file <tmp>` with the repo PR template filled in (summary, related issues with the correct closing keyword, changes, how to test). Keep the body succinct.
- Not a draft: draft PRs commonly skip CI. If the existing PR is a draft, `gh pr ready <n>` once the local gate is green.
- About 30 s later check `gh pr view <n> --json mergeable,mergeStateStatus`. A CONFLICTING PR gets no CI run: fix per step 1 and push.

## 3. Wait for green

- Find the run for the head SHA: `gh run list --branch <branch> --commit <sha> --json databaseId,name,status,conclusion,event`. Watch by run id (`gh run watch <id> --exit-status`), not the check rollup: the rollup reads green before jobs register and on skipped draft runs.
- Wait with a background command or watcher that exits when the run completes, never with foreground sleep loops. In zsh scripts do not name a variable `status`; it is read-only there.
- Green means every workflow run for the current head SHA is `completed`/`success` and `mergeStateStatus` is CLEAN (or BLOCKED only on reviews, which the user handles). Zero-second failures beside a completed run on the same SHA are usually a cancelled duplicate; confirm with `gh run list`.

## 4. Fix failures (loop, max 5 iterations)

1. `gh run view <id> --log-failed` (or `gh run view <id> --job <job-id> --log`). Read the actual error, not the job name.
2. Reproduce locally with the command the workflow ran. Fix the root cause; do not skip or weaken tests, and do not add lint or type ignores to get through.
3. Genuine infrastructure flake (runner lost, network, cache miss): `gh run rerun <id> --failed` once. If it fails again, treat it as real.
4. Commit, push, go back to step 3. A force-push does not free a stale in-progress run of the same PR; `gh run cancel <old-id>` if the new run sits pending with no jobs.
5. A failure caused by the base moving (an overlapping merge): merge `origin/<base>` again and push.

Stop and report instead of continuing when the cap is hit, when the fix needs a design change or touches unrelated subsystems, or when the same failure is red on the base branch itself.

## 5. Merge

- Re-fetch the base right before merging. If it moved, `git merge-tree` against the new tip decides whether another merge and CI wave is needed.
- Check `git log origin/<base>..HEAD` for stray closing keywords the squash message would carry; the PR body is the intended closer.
- `gh pr merge <n> --squash --match-head-commit <sha>`. Repo merge rules win (some repos use the merge-async API or Graphite). No `--delete-branch` (auto-delete handles it and the flag tries to check out trunk locally). No `--admin`, and no `--auto` to bypass failing or pending checks. If the merge is blocked on required reviews, stop and hand the PR URL to the user.
- Confirm `gh pr view <n> --json state` reports MERGED.

## Report

PR URL, merged SHA, each CI failure and its fix in one line, and anything left to the user (reviews, follow-ups, superseded branches). Skipped steps are stated, not implied.

## Never

- Push to or force-push the base branch.
- Merge on red, pending, or skipped checks.
- Use `--no-verify`, `--admin`, or disable a check to get through.
- Rewrite commits from other authors.
- Hand the loop to a subagent.
