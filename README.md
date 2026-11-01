# agent-bootstrap

Claude Code tooling (slash commands, subagents, skills) kept in git, so a
Conductor cloud workspace or a new machine can install it at session start.

It ships tooling only: no wiki pages and no organization context. Those stay on
the machine that wrote them. The shipped `CLAUDE.md` holds tooling pointers only.
Anything specific to one repo (its environment, scripts, checks, secrets) lives
in that repo.

## Layout

| Dir                     | Installs to                     | Notes                                                       |
|-------------------------|---------------------------------|-------------------------------------------------------------|
| `commands/`             | `$CLAUDE_CONFIG_DIR/commands`   | slash commands (`/ship`, ...)                               |
| `agents/`               | `$CLAUDE_CONFIG_DIR/agents`     | subagents that `/ship` and the review/refactor flows delegate to |
| `skills/`               | `$CLAUDE_CONFIG_DIR/skills`     | skills (symlinks into `~/.agents/skills` are materialized)  |
| `workflows/`            | `$CLAUDE_CONFIG_DIR/workflows`  | Workflow scripts                                            |
| `home/CLAUDE.md`        | `~/.claude/CLAUDE.md`           | global-engineering defaults, beads as the tracker when `bd where` resolves, pstack model choices; an include stub goes to `$CLAUDE_CONFIG_DIR/CLAUDE.md` when that dir differs |
| `agent-shared/docs/`    | `~/.agent-shared/docs/`         | the workflow docs that commands, skills and agents read     |
| `agent-shared/wiki/SCHEMA.md` | `~/.agent-shared/wiki/`   | page format for `/synthesize-learnings`; the wiki itself is not shipped |
| `cursor/`               | not installed; the orchestrator reads it | one Cursor cloud agent per work item: [`item-agent.md`](cursor/item-agent.md) (the agent's contract, sent in each prompt), [`orchestrator.md`](cursor/orchestrator.md) (repo setup, Cloud Agents API, integration) |

`install.sh` also:

- installs the plugins listed in `PLUGINS` (currently `pstack`, which the
  `commands/pstack-*.md` stubs invoke);
- sets up **beads** when the workspace repo's origin carries `refs/dolt/data`:
  downloads `bd` (version pinned in the script) into `~/.local/bin`, then runs
  `bd bootstrap --yes` on a fresh clone or `bd dolt pull` later. Repos without
  Dolt data skip the download.

`install.sh` refuses to run on macOS, so it can never overwrite the source of truth.

## Usage: a SessionStart hook

Conductor cloud ignores a repository's own `scripts.setup`, so drive the install
from a per-repo `SessionStart` hook in `.claude/settings.local.json` (gitignored):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "if [ \"$(uname -s)\" != \"Darwin\" ]; then tmp=\"$(mktemp -d)\"; git clone --depth 1 --quiet https://github.com/presolved/agent-bootstrap.git \"$tmp\" 2>/dev/null && WORKSPACE_DIR=\"$PWD\" bash \"$tmp/install.sh\" || true; rm -rf \"$tmp\"; fi; true",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

To get that file into cloud workspaces, add `.claude/*` to the repo's
Files-to-copy globs in `.conductor/settings.local.toml`.

The hook runs whatever is on `main` with the workspace's secrets in scope.
Anyone who can push here, or to a plugin's repo, can run code in every workspace
that uses it. Keep push access tight, or check out a pinned commit in the hook.

## Updating

Edit `~/.claude/{commands,agents,skills,workflows}` or the docs in
`~/.agent-shared/docs` on the Mac, then run `./sync-from-mac.sh`. It mirrors
those dirs into this repo, then commits and pushes.

The sync never copies wiki pages or `skills/iterate/repos/*` configs, and it does
not mirror the Mac's `~/.claude/CLAUDE.md`: edit `home/CLAUDE.md` in this repo.
`cursor/` is not mirrored either; edit it here.
Put regexes for names that must never ship (clients, hostnames, tenants) in a
local `.sync-deny` file, one per line. The file is gitignored. If any synced file
matches, the sync stops before committing.
