# Orchestrating Cursor cloud agents: one agent per item

An orchestrator (a bot or a person) splits work into items and starts one
Cursor cloud agent per item through the Cloud Agents API. Each agent gets its
own VM, branch, PostgreSQL, and app, so items never share a server or a
database. The agent side of the contract is [item-agent.md](./item-agent.md),
plus the repo's notes in `repos/<owner>__<repo>/NOTES.md`.

Nothing has to be committed to the target repo. The environment lives in the
Cursor dashboard, and a saved environment takes precedence over a repo's
`.cursor/environment.json`.

## One-time setup, per repo

1. **A read token for this repo.** Create a fine-grained GitHub token with
   read-only Contents access to `presolved/agent-bootstrap` only.
2. **Secrets** (Cloud Agents → Secrets, scoped to the environment):
   `AGENT_BOOTSTRAP_TOKEN` (the token above), plus the secrets the repo's
   `NOTES.md` lists.
3. **A saved environment** for the repo (Cloud Agents → Environments):

   Install:

   ```bash
   d="$HOME/.agent-bootstrap"; if [ -d "$d/.git" ]; then git -C "$d" pull -q --ff-only; else git clone -q --depth 1 "https://x-access-token:${AGENT_BOOTSTRAP_TOKEN}@github.com/presolved/agent-bootstrap.git" "$d"; fi; bash "$d/cursor/install.sh"
   ```

   Start, if the environment offers a start command (agents also run it
   themselves, per item-agent.md):

   ```bash
   bash "$HOME/.agent-bootstrap/cursor/start.sh"
   ```

4. **A Cursor API key** for the orchestrator (Dashboard → API Keys, or a service
   account key).

The install step runs whatever is on this repo's `main` with the environment's
secrets in scope. To pin it, check out a fixed commit after the clone.

## Per item

**Start.** `POST https://api.cursor.com/v1/agents`, authenticated with the key
as the Basic auth username (`-u "$CURSOR_API_KEY:"`) or a Bearer token:

```json
{
  "name": "<item slug>",
  "prompt": {
    "text": "Follow ~/.agent-bootstrap/cursor/item-agent.md and ~/.agent-bootstrap/cursor/repos/<owner>__<repo>/NOTES.md.\n\nItem: <slug>\nBrief: <the user's words verbatim>\nDone when: <what the user sees in the app>\nKnown files: <paths, if any>"
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
integrated work in one app, use the repo's preview deployments, or start one
more agent whose brief is only to serve the integration branch for review. A
person cannot sign in to a server that an agent signed in with a synthetic
session; a test-mode server with mock sign-in can be reviewed through the
agent's forwarded port.

## Reference

- [Cloud Agents API endpoints](https://cursor.com/docs/cloud-agent/api/endpoints)
- [Cloud environment setup](https://cursor.com/docs/cloud-agent/setup)
- [Cloud Agents](https://cursor.com/docs/cloud-agent)
