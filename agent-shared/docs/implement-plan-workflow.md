# Implement Plan Workflow

Use this workflow to implement a plan in a portable, single-agent way across Claude Code and Codex.

## Plan source

Assume the active plan is already present in the conversation context.

- If the user explicitly provides a markdown file path, read that file and use it as the plan source.
- If the user says the plan is stored on disk but does not provide the contents in context, ask for the exact path or enough detail to locate it safely.
- Do not start with automatic disk discovery as the default behavior.

## Initial setup

1. Read the plan from conversation context, or from the explicit file path the user supplied.
2. Read repository instructions such as `AGENTS.md`, `CLAUDE.md`, and `docs/constitution.md`.
3. Derive a concrete task list if the plan is not already broken into actionable steps.
4. Prefer repository-specific Codex or Claude skills over shared home-level defaults when the repo provides them.

## Authentication and prerequisite checks

Scan the plan and verification steps for requirements such as login, SSO, credentials, tokens, browser auth, or manual infrastructure access.

- If a prerequisite requires browser authentication, open the relevant login page with the available browser automation tools before asking the user to authenticate.
- After the login page is open, ask the user to complete any manual authentication steps before continuing.
- If the prerequisite is non-browser setup such as tokens or credentials, stop and ask the user to complete it before continuing.
- Do not pretend those steps are complete.

## Implementation loop

Work through the plan sequentially unless the repo explicitly supports safe parallelism and the task decomposition is independent.

For each task:

1. State the task you are implementing.
2. Read only the code needed for that task.
3. Implement the change.
4. Run the narrowest useful verification for the task.

## Verification

- Run the repository-defined verification commands from local instructions when they exist.
- Prefer repo-native task runners such as `nx`, `yarn`, `npm`, or `pnpm` rather than raw tool invocations when the repo already wraps them.
- Expand from targeted checks to broader checks as the implementation stabilizes.
- Call out anything you could not verify.
