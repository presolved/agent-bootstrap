---
name: iterate
description: Lead an iteration run. Take the user's feedback, give each item its own Conductor implementer session and worktree, land every item on one integration branch served by one dev server, and gate that branch with the repo's check.
disable-model-invocation: true
---

# Iterate

You are the **lead**. The user gives you feedback on the running app; you split it into items, and each item gets its own implementer session (a Conductor session in this workspace) working in its own git worktree. Implementers land their commits, work in progress included, on the **integration branch** in the main checkout, which one dev server serves, so they test each landing in the browser without a server of their own. The **gate** runs the repo's full check on the integration branch once landings go quiet, and tells the items whose landings a failure covers. The user can talk to any implementer session directly to iterate on one item alone.

`iter` below means `node <this skill's directory>/scripts/iter.mjs`. It does everything deterministic: worktrees, sessions, landing, the gate and its debounce, the server, and a guard hook for implementers. `iter help` lists its commands. Your part is judgement: splitting the feedback, writing briefs, checking results in the browser, and talking to the user.

The main checkout stays **integration-only**: nobody edits files there, you included. All code changes happen in item worktrees.

## Start

1. Run `iter init` from the main checkout (`--integration <branch>` when the integration branch is not the checked-out one). It records the run, takes the current head as the gate's first green commit, and installs the guard hook. If it warns about uncommitted changes in the main checkout, find out whose they are before anything lands; `land` refuses while they exist. If it reports no repo config, read [`repos/README.md`](repos/README.md) and write one before spawning.
2. Run `iter server status`. When there is no iter server, start one with `iter server up` (give `--port` when the user will open it through a port forward; the user's global instructions say how to choose that port). When it reports a server iter did not start, ask the user whether to stop it; never stop it yourself.

Done when `iter status` shows the integration branch, the gate green, and a server that is up. Spawn after the server is up, so each brief carries its URL.

## Each round of feedback

1. Split the feedback into **items**: one item is one change the user can see and judge on its own. Keep two requests in one item when they change the same component or file; `iter status` flags overlaps between items, so a split you got wrong shows up there.
2. For each new item, write a brief to a temp file: the user's words verbatim, what done looks like in the app, and any file or component you already know is involved. Then `iter spawn <slug> --brief <file>`. Implementers run on Opus 5.5 at high effort (`opus-5-5-1m`, `high`), the config default; leave it unless the user asks otherwise. Feedback on an existing item goes to its session instead: `conductor message create --session <id> --message "..."`.
3. Tell the user, in one table, each item's slug, what it covers, and its session link, and that they can message any session directly.

Done when every piece of feedback is in a brief or a message, and the user has the table.

## While items run

1. Run `iter watch` detached, with its output going to a log (`setsid nohup <iter> watch >> <log> 2>&1 < /dev/null &`). Arm the Monitor tool on `tail -n 0 -F <log>`, and re-arm it when it expires. Never arm the Monitor on `iter watch` itself: the watch starts the gate, and a Monitor expiry kills the gate mid-run along with it. It opens with one summary line, then prints only what you act on: a session going idle, a landing, a gate result, a new overlap, the server going down.
2. When an item's session replies `READY`, check the item in the browser against the running server with the repo's verification approach, then tell the user what to look at. When a session goes idle without landing, read its last message (`conductor session message <id>`) and either answer it or tell the user.
3. On `gate FAIL`, the gate has already sent the log to every item it names. When it names more than one, read the log, work out whose change broke it, and tell that session; when it names none, the failure predates the run, so tell the user. `iter gate` checks the current head at once, without waiting for quiet.
4. When the server goes down, read `iter server logs` and bring it back with `iter server up`. When the log shows no error, the sandbox likely killed it for memory. Check `free -m` and `ps -eo rss,args --sort=-rss | head` before restarting, and remove whatever is eating the memory.
5. Keep the heavy lock moving. It is one queue for the gate and every session.
   - When the gate is still checking an older commit and sessions are queued behind it, stop it. Kill its process tree; the pid is in `.git/iter/gate.lock/owner`. Passed tasks stay in the Nx cache, and `iter watch` re-gates the head once landings go quiet.
   - A gate killed mid-run can leave stale `*.tsbuildinfo` files in the `.gate` worktree, so typechecks fail or never finish. Delete them before the next gate.
6. Mind memory: on a small sandbox, the dev server is the largest process and the first one killed.
   - Stop it with `iter server down` while no browser check is due, such as during a round of code-only fixes. Bring it back before the next check.
   - After a landing adds a workspace lib or a dependency, run `yarn install --frozen-lockfile` (or the repo's equivalent) in the main checkout and in the `.gate` worktree. Otherwise the server and the gate fail to resolve it.

## Asking the user

Conductor shows the user only your last message, and every watch event ends a turn with a new one, so a question asked inside a status update is buried by the next event.

- Ask every decision the user must make with the `AskUserQuestion` tool (`mcp__conductor__AskUserQuestion` in Conductor), batching the open ones into one call. That includes picking between prototypes, product calls an implementer raised, and which items to accept. It holds your turn until the user answers, so handle pending events first.
- A reply to a watch event is one line and asks nothing. When a decision is still open, ask it again with `AskUserQuestion` rather than restating it in a reply.

## Closing an item and the run

- When the user accepts an item, run `iter done <slug>`. It archives the session and removes the worktree and branch, and refuses while anything is unlanded or the gate has not passed on the item's last landing.
- The integration branch is pushed only when the user asks: `iter push` pushes its last green commit.
- When the run ends, leave the server up unless the user asks otherwise, and report the integration branch head and what each item changed.
