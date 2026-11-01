# Orchestrating Cursor cloud agents: one agent per item

> **For grok bots** (or a person) orchestrating the work. A Cursor cloud agent
> never reads this page; its instructions are
> [`cursor-agents/item-agent.md`](../cursor-agents/item-agent.md).

The orchestrator splits work into items and starts one Cursor cloud agent per
item with Grok Bot's built-in **CloudAgent** tool. Each agent gets its own VM,
branch, database, and app, so items never share a server or a database. The
agent's side of the contract is
[item-agent.md](../cursor-agents/item-agent.md), which the orchestrator sends
in every prompt.

This page is the workflow. Everything specific to one repo lives in that repo.

Do **not** launch agents through `https://api.cursor.com/v1/agents` or a
`CURSOR_API_KEY`. That path is banned for this fleet (API creates are checked
against prepaid credit even when weekly included usage remains). Use CloudAgent
only.

## What a repo provides

- **A committed `.cursor/environment.json`** whose `install` step installs the
  repo's dependencies and whose `start` step starts its services. Both must be
  idempotent. A repo with background workers gives each agent its own database:
  two app servers on one database take each other's jobs and run them with the
  wrong code.
- **Cloud-agent notes**, linked from the repo's `AGENTS.md`: the start step, the
  checks to run, how to verify in the app, and the secrets real-service mode
  needs.

## One-time setup, per repo

1. Cloud Agents on the Cursor plan, with the Cursor GitHub app granted
   read-write access to the repo (public alone is not enough).
2. The secrets the repo's notes list, in Cloud Agents → Secrets (or a saved
   environment that already has them), scoped so the agent can run Claude Code
   / real-service checks. Prefer `CLAUDE_CODE_OAUTH_TOKEN` on Patrice's Claude
   plan; never API-key billing for the coding work.
3. Grok Bot CloudAgent tool available to the orchestrator bot (no separate
   Cursor API key for launches).

Do not save a dashboard environment for the repo unless you need it for
secrets: a saved environment takes precedence over the repo's
`.cursor/environment.json`.

## Per item

**Start.** Call CloudAgent `launch` with:

- `repo`: the full GitHub URL (e.g. `https://github.com/<owner>/<repo>`)
- `starting_ref`: the integration branch
- `title`: the item slug (optional but useful)
- `secret_names`: whatever the repo notes need (often
  `["CLAUDE_CODE_OAUTH_TOKEN"]`) when forwarding is enabled; otherwise use a
  saved environment that already holds those secrets
- `prompt`: `cursor-agents/item-agent.md` from this repo's `main`, **verbatim**,
  then a separator and the item fields:

```text
<item-agent.md, verbatim>

---

Repo notes: <path from the repo's AGENTS.md>
Item: <slug>
Brief: <the user's words verbatim>
Done when: <what the user sees in the app>
Known files: <paths, if any>
```

Put anything specific to the item in the brief, not in an edited copy of the
contract. Omit CloudAgent `model` unless the user asked for an override; Claude
Code inside the agent follows the fleet defaults (e.g. opus + high) when it
runs `claude`.

Keep the returned agent id (`bc-…`) and the cursor.com agent URL.

**Watch.** Prefer CloudAgent revival when the run finishes. While it is still
open, hang-watch with CloudAgent `get` at least every 10 minutes. On
completion, parse the report block at the end of the agent's result and take
the pushed branch from the agent status / PR metadata.

**Follow up.** CloudAgent `reply` on the same `bc-…` agent. Use `steer` to
inject into a running turn; use `queue` when the current run should finish
first; use `interrupt` only when the user asked to stop or restart in-flight
work.

**Finish.** CloudAgent `archive` once the branch is merged (or the item is
discarded). `cancel` if the run must stop without merging.

## Integration

- Start every item from one integration branch (`starting_ref`), and merge
  `READY` branches into it yourself. An agent never merges.
- On a conflict, send the agent a follow-up: "Merge `<integration branch>` into
  your branch, resolve the conflicts, re-run the checks and verification, and
  push." Do not resolve it in the orchestrator.
- Start dependent items only after their blocker is merged, from the new
  integration head. Do not run two agents on the same files at once.
- `NEEDS_DECISION`: ask the user, then send the answer as a follow-up.
  `BLOCKED`: fix the cause (secrets, access, a broken integration head) and send
  a follow-up, or cancel the item.

## Reviewing the result

Each agent reports what it verified and where its evidence is. To review the
integrated work in one app, use the repo's preview deployments (its notes say
how), or start one more agent whose brief is only to serve the integration
branch for review.

## Reference

- [Cloud Agents](https://cursor.com/docs/cloud-agent)
- [Cloud environment setup](https://cursor.com/docs/cloud-agent/setup)
- Item contract: [cursor-agents/item-agent.md](../cursor-agents/item-agent.md)
