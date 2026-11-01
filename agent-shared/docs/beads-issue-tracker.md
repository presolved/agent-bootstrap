# Issue tracker: beads (`bd`)

Applies in any repo where `bd where` resolves a `.beads/` workspace. Repos without one keep their own tracker. A workspace syncs through `refs/dolt/data` on origin; keep `.beads/` out of git (`.git/info/exclude` or `.gitignore`).

Rules: never run raw `dolt`; `bd --readonly <cmd>` when only reading; writes auto-commit, so `bd dolt push` right after a batch of writes (other workspaces only see pushed commits); `.beads/issues.jsonl` is an export, not sync.

## Conventions

| Operation | Command |
| --- | --- |
| Create | `bd create "<title>" --body-file - --silent <<'EOT' … EOT` (prints the id; `-l a,b`, `--parent <id>`, `--type epic`) |
| Read | `bd show <id>` (`--json` for scripting) |
| List | `bd list [-l <label>] [--parent <id>]`, `bd children <id>` |
| Comment | `bd comments add <id> "<text>"` |
| Edit body | `bd update <id> --body-file -` (replaces the whole body; `bd show` first) |
| Labels | `bd label add <id> <label>` / `bd label remove <id> <label>` |
| Close | `bd close <id> --reason "<why>"` |
| Sync | `bd dolt push` / `bd dolt pull` (`bd dolt remote list` shows the target) |

Refer to issues by title with the id in parentheses: `Pick the storage shape (proj-a3f2.1)`, never by bare id.

## When a skill says "publish to the issue tracker"

`bd create`. Bodies are markdown; pass them with `--body-file -` and a heredoc.

## When a skill says "fetch the relevant ticket"

`bd show <id>`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an epic; tickets are its child issues and get ids of the form `<map>.N`.

| Operation | Command |
| --- | --- |
| Map | `bd create "<destination title>" --type epic -l wayfinder:map --body-file - --silent` with the Destination / Notes / Decisions so far / Not yet specified / Out of scope body |
| Child ticket | `bd create "<question title>" --parent <map> -l wayfinder:<research\|prototype\|grilling\|task> --body-file - --silent` with a `## Question` body |
| Blocking | `bd dep <blocker> --blocks <blocked>` (native edge; unblocked when every blocker is closed) |
| Frontier | `bd ready --parent <map> -u` = open, unblocked, unassigned children. First listed wins. `--json` for ids |
| Claim | `bd update <id> --claim` (assignee = git user, status `in_progress`; leaves the frontier). First write of the session |
| Zoom | `bd show <id>`; `bd children <map>` for the tree with status glyphs |
| Resolve | `bd comments add <id> "<answer>"` → `bd close <id> --reason resolved` → rewrite the map body with the new Decisions-so-far line (`bd update <map> --body-file -`) |
| Out of scope | `bd close <id> --reason "out of scope: <why>"` and a line in the map's Out of scope section |
| Find maps | `bd list -l wayfinder:map` |

Concurrent sessions: embedded mode is single-writer and file-locked, so `bd` calls from parallel workspaces serialize on the lock; keep calls short.

## Sync and new workspaces

Every clone holds its own Dolt copy (its worktrees share one); `refs/dolt/data` on origin is the meeting point. The repo's `.claude/settings.local.json` hooks do the routine sync: SessionStart pulls (and on a cloud clone installs `bd` and bootstraps first), SessionEnd pushes. Sessions do not always end cleanly, so push explicitly after writing.

| Situation | Do |
| --- | --- |
| New worktree of an existing clone | Nothing; discovery goes through the git common dir |
| Start of beads work | `bd dolt pull` if the session hook did not run (e.g. the workspace predates the hook) |
| After creating, closing, or editing tickets | `bd dolt push` (fast; no-op when nothing changed) |
| New cloud workspace | Automatic on the first Claude session: this repo's `install.sh` installs `bd` (version pinned in the script) into `~/.local/bin`, runs `bd bootstrap --yes` (clones `refs/dolt/data`, wires origin), `chmod 700 .beads`, `git config beads.role maintainer`. Manual equivalent: the same four commands |
| New machine | Install `bd` (Homebrew `beads` on macOS), then the same `bd bootstrap --yes`, `chmod 700 .beads`, `git config beads.role maintainer` |
| Pull reports a conflict | Two copies edited the same ticket while unpushed; `bd show <id>` on both sides, fix the loser by hand, then push |
| Upgrading `bd` across a schema migration | Push with the old binary first; exactly one clone runs `bd migrate` then `bd dolt push`; every other clone runs `bd bootstrap` |
