# presolved/iem-planning-augmentation: cloud-agent notes

Read with `~/.agent-bootstrap/cursor/item-agent.md`. `AGENTS.md` and
`docs/constitution.md` in the repo still win.

## Check

Run `yarn gate` before you report (`.claude/skills/pre-pr-ci/SKILL.md`). When the
diff changes an editor app or its build, also run
`bash .claude/skills/pre-pr-ci/scripts/run-checks.sh standard`. Run
`yarn format` before committing.

## Verify

- **Test mode, the default:** the repo's `verify` skill
  (`.claude/skills/verify/SKILL.md`). It runs the Plan Editor with mock auth, an
  in-memory database, and mocked LLM, SharePoint, and Search. It needs no
  secrets.
- **Real services**, only when the behavior depends on real Azure OpenAI,
  SharePoint, or Azure Search. From the repo root:

  ```bash
  node ~/.agent-bootstrap/cursor/repos/presolved__iem-planning-augmentation/serve-real.cjs --port 3200
  ```

  It migrates this machine's `planning_db`, takes dev's non-secret settings from
  the repo's deployment config, and signs the verify harness in with a synthetic
  admin session. Drive it with the verify harness against target
  `http://localhost:3200`, with `allowWrites: true` when the item writes. Pass
  `--search-index sharepoint-documents-v2-agent-<branch segment>` before you
  index anything.

The real services are the ones deployed environments use, and real people see
what you write there. Write only what the brief needs, and clean it up. The
synthetic session proves nothing about Entra sign-in: if the item changes
sign-in or delegated Graph access, report it as not verified.

## Secrets (real-service mode only)

`IEM_LLM_API_KEY`, `AZURE_SEARCH_ADMIN_KEY`, `SHAREPOINT_TENANT_ID`,
`SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`,
`SHAREPOINT_DRIVE_ID`, `ENTRA_ID_TENANT_ID`, `PLAN_EDITOR_ENTRA_ID_CLIENT_SECRET`.
Never `DATABASE_URL`: `serve-real.cjs` refuses a database that is not this
machine's own.
