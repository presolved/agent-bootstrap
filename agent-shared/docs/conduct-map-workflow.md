# Conduct-Map Workflow

Portable orchestrator workflow: work an entire wayfinder map from one session by dispatching each frontier ticket to its own Conductor session (tab) in the same workspace, watching the tracker, and advancing until the map is done.

A wayfinder map exists (see the wayfinder skill / methodology) and the human wants to walk the whole thing without opening each session by hand. This session is the **conductor**: it dispatches tickets, watches the tracker, and reports. It **never resolves a ticket itself** — every ticket, including research, is resolved in its own Conductor session, preserving wayfinder's one-ticket-per-session rule. The one tracker write this session may make is repair bookkeeping (below).

Tracker mechanics (frontier, claim, resolve, sync) are in `~/.agent-shared/docs/beads-issue-tracker.md` § Wayfinding operations (for beads repos). Follow wayfinder's **refer-by-name** rule everywhere the human reads: ticket titles with the id in parentheses, never bare ids.

## Input

- A map id → conduct that map.
- Empty → `bd list -l wayfinder:map`; exactly one open map → use it; several → ask once.
- No map → nothing to conduct; point the user at the wayfinder skill to chart one.

## Prerequisites

- `conductor` CLI reachable (`which conductor`). Without it (e.g. a plain local session), fall back to hand-off-in-chat: present one frontier ticket at a time to the user here, and skip everything about tabs below.
- Tracker resolves (`bd where` for beads).

## Setup (once)

1. Load the map body (destination, Notes, Decisions so far) and `bd children <map>` for the tree.
2. Create the progress file `.context/conduct-map-<map>.md`: the destination, then a status table — ticket (by name), type label, tracker state, session id + deep link, dispatched-at, outcome. **Update it after every dispatch and every closure**; it is the durable state a resumed session continues from.
3. Tell the user the plan: how many tickets are open, what the current frontier is, and that HITL tabs will arrive as deep links for them to drive.

## Dispatch

The frontier is `bd ready --parent <map> -u --json` (open, unblocked, unclaimed). For each frontier ticket **not already dispatched** (check the progress file — a dispatched ticket stays unclaimed until its session claims it, so the frontier query alone is not a dedupe):

```
conductor session create --json \
  --agent claude \
  --model opus-5-5-1m \
  --effort medium \
  --name "<ticket-id>: <title>" \
  --message-file -
```

Ticket sessions are always `--agent claude` regardless of which agent is conducting: the wayfinder skill the child must run is installed for Claude. Default ticket sessions to `opus-5-5-1m` (Opus 5.5) at `medium` effort; deviate only when the user asks.

Message template (fill per ticket):

> Run the Skill tool with "wayfinder" for map `<map>`, ticket `<ticket-id>` ("<title>"). Claim it first; resolve only this ticket this session. It is a `wayfinder:<type>` ticket — for HITL types (grilling, prototype, HITL task) work **with** the human in this tab and never stand in for their side. This worktree is shared with a conductor session and possibly sibling ticket sessions: do not switch the workspace branch; if the ticket produces code or files, work on a dedicated branch in your own git worktree and link it from the ticket; keep chat-session artifacts under `.context/`. On resolution follow the tracker doc's Resolve row (comment → close → map Decisions-so-far line), create/wire any newly-surfaced tickets, then `bd dolt push`.

Record the returned session id and **deep link** in the progress file, then message the user: HITL tickets as a short list of deep links by name ("these tabs are yours to drive"), AFK tickets as a one-liner ("running on their own").

**Concurrency rules:**

- Research and grilling tickets: dispatch freely, but keep at most **3 HITL tabs** open at once — a human can't drive more; dispatch the rest as tabs close.
- Prototype and task tickets that will write code: at most **one at a time** in the shared worktree; more only when each is isolated in its own worktree (the message template already requires this, but don't rely on it for simultaneous heavy builds).

## Watch loop

Poll on a few-minute cadence using your harness's monitor/wait facility or a background `until` loop — never a bare foreground sleep. Same workspace = same beads database, so no `bd dolt pull` between checks. Each cycle:

1. `bd children <map>` — diff against the progress file.
2. A ticket closed → record the outcome (read its resolution comment for the gist), refresh the frontier (**resolutions create and unblock new tickets — re-query, don't assume**), dispatch what's newly takeable, `bd dolt push`, and give the user a one-line update by ticket name.
3. A ticket claimed and `in_progress` but its session has sat `idle` for a long stretch (`conductor session status`) → nudge it once with `conductor message create` (ask it to resolve-and-close or report its blocker); still stalled next cycle → surface to the user with the deep link, don't force it.
4. A session ended without closing its ticket (crashed tab, ephemeral-sandbox loss) → do the **repair bookkeeping** yourself: recover what it reported (its transcript via `conductor session message`, any pushed branch), post the resolution comment, close the ticket, append the map's Decisions-so-far line — or, if nothing recoverable happened, unclaim/reset it and redispatch. This is the only situation where the conductor writes to the tracker.

## Stops

- **Done:** no open children remain → verify every closed ticket has its Decisions-so-far line (add any a child session missed), final `bd dolt push`, then report: destination, the decisions digest by name, the map link, and any branches/artifacts produced.
- **Deadlock:** frontier empty, open tickets remain, none are out with the user in a live tab → stop and show the blocked tickets and what blocks them.
- **User exit:** the user can stop conducting at any time; the progress file plus the tracker are enough to resume later — on resume, reconcile the progress file against `bd children` and `conductor workspace session` before dispatching anything.
