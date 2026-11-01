# Repo configs for iterate

`iter` reads `repos/<owner>__<repo>.json`, named from the main checkout's `origin` URL (`github.com/acme/web-app` → `acme__web-app.json`). A repo with no file runs on the defaults below. `ITER_CONFIG=<path>` overrides the lookup.

Command templates are run with `bash -c`. `{name}` placeholders are replaced with shell-quoted values, so leave them unquoted: `{main}` (main checkout), `{repoName}`, `{integration}` (integration branch), `{configDir}` (this folder), `{slug}`, `{branch}`, `{path}` (the item's worktree, or the gate's), `{base}` (in `check`, the last commit that passed the gate), `{port}`, `{url}`.

| Key | Default | What it does |
| --- | --- | --- |
| `branchPrefix` | `"iter/"` | Item branches are `<prefix><slug>`. |
| `worktree.root` | `"{main}/../{repoName}-iter"` | Folder holding the item worktrees (placeholders unquoted here). |
| `worktree.setup` | `["git worktree add -b {branch} {path} {integration}"]` | Commands run in the main checkout to create an item worktree. Add dependency and env-file setup here. |
| `check` | `null` | The repo's full check. The gate runs it on an integration commit in its own worktree (`<worktree.root>/.gate`, made with `worktree.setup`), under the heavy lock, to cover everything since `{base}`. `null` records a pass without running anything. |
| `gate.quietSec` | `120` | `iter watch` starts the gate once the integration head has stood still this long. |
| `gate.maxWaitSec` | `900` | ...or once changes have waited this long under a stream of landings. |
| `push` | `false` | Push each commit that passes the gate. |
| `opener` | `"/pstack:poteto-mode"` | Text the implementer's first message starts with, such as a slash command that loads a skill; the brief follows as its arguments. `null` sends the brief alone. |
| `agent`, `model`, `effort` | `"claude"`, `"opus-5-5-1m"`, `"high"` | The implementer session: Opus 5.5 at high effort, since implementers prototype. `iter spawn --model`/`--effort` override per item. The guard hook only runs in `claude` sessions. |
| `heavy.minFreeMB` | `0` | `iter heavy` waits until this much memory is available (Linux only). |
| `heavy.patterns` | `[]` | Regexes for commands the hook makes implementers run through `iter heavy`. |
| `block` | `[]` | `{ "pattern", "message" }` pairs: Bash commands the hook refuses implementers, with the message they see. |
| `server` | `null` | The one dev server: `start` (command, gets `{port}` and `PORT`), `cwd`, `env`, `basePort`, `health` (path that answers below 500 when ready), `readyTimeoutSec`, `exclusiveDir` (a folder only one server may run from; `server up` refuses while a process iter did not start runs there), and `browse` (a paragraph for the implementer brief on driving a browser against `{url}`, such as how to sign in). |

Keep repo-specific launchers and setup scripts in a folder named like the config (`repos/<owner>__<repo>/`) and reach them through `{configDir}`.
