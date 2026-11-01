# Orchestrating Cursor cloud agents: one agent per item

> **For grok bots** (or a person) orchestrating the work. A Cursor cloud agent
> never reads this page; its instructions are
> [`cursor-agents/item-agent.md`](../cursor-agents/item-agent.md).

The orchestrator splits work into items and starts one
Cursor cloud agent per item through the Cloud Agents API. Each agent gets its
own VM, branch, database, and app, so items never share a server or a
database. The agent's side of the contract is
[item-agent.md](../cursor-agents/item-agent.md), which the orchestrator sends
in every prompt.

This page is the workflow. Everything specific to one repo lives in that repo.

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

1. Cloud Agents on the Cursor plan, with read-write access to the repo.
2. The secrets the repo's notes list, in Cloud Agents → Secrets, scoped to the
   repo.
3. A Cursor API key for the orchestrator (Dashboard → API Keys, or a service
   account key).

Do not save a dashboard environment for the repo: a saved environment takes
precedence over the repo's `.cursor/environment.json`.

## Per item

**Start.** `POST https://api.cursor.com/v1/agents`, authenticated with the key
as the Basic auth username (`-u "$CURSOR_API_KEY:"`) or a Bearer token:

```json
{
  "name": "<item slug>",
  "prompt": {
    "text": "<item-agent.md, verbatim>\n\n---\n\nRepo notes: <path from the repo's AGENTS.md>\nItem: <slug>\nBrief: <the user's words verbatim>\nDone when: <what the user sees in the app>\nKnown files: <paths, if any>"
  },
  "repos": [
    {
      "url": "https://github.com/<owner>/<repo>",
      "startingRef": "<integration branch>"
    }
  ],
  "autoCreatePR": false
}
```

Send `cursor-agents/item-agent.md` as it is on this repo's `main`. Put anything specific to the
item in the brief, not in an edited copy of the contract.

Keep `agent.id` (`bc-…`) and `run.id` (`run-…`) from the response. Omit `model`
to use the team default, or pass an id from `GET /v1/models`.

**Watch.** `GET /v1/agents/{id}/runs/{runId}` until `status` is `FINISHED`,
`ERROR`, `CANCELLED`, or `EXPIRED`, or stream
`GET /v1/agents/{id}/runs/{runId}/stream`. v1 has no webhooks yet. On
`FINISHED`, parse the report block at the end of `result`, and take the pushed
branch from `git.branches[].branch`.

**Follow up.** `POST /v1/agents/{id}/runs` with `{ "prompt": { "text": "…" } }`
sends review fixes to the same agent and branch. While a run is active, the API
answers `409 agent_busy`; add `"delivery": "steer"` to add the message to the
running turn instead.

**Finish.** `POST /v1/agents/{id}/archive` once the branch is merged.

## Integration

- Start every item from one integration branch (`startingRef`), and merge
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

- [Cloud Agents API endpoints](https://cursor.com/docs/cloud-agent/api/endpoints)
- [Cloud environment setup](https://cursor.com/docs/cloud-agent/setup)
- [Cloud Agents](https://cursor.com/docs/cloud-agent)
