---
description: Generate a scannable technical review report of the current changeset under .context/. Defaults to delta mode (covers only changes since the prior report). Use `--full` for the whole-branch report. Also accepts an optional git range and `--plan <path>` for Traceability sections.
---

## User Input

```text
$ARGUMENTS
```

## Workflow

Follow `~/.agent-shared/docs/changeset-report-workflow.md`.

Parse `$ARGUMENTS` for:

- A git range (e.g., `main...HEAD`, `abc123..def456`). When present, it wins over all other base resolution.
- `--full` — force whole-branch scope (base = merge-base with the primary branch). Overrides delta mode.
- `--plan <path>` — supply a plan / spec file for the Traceability and Delta sections.

**Default: delta mode.** If a prior `changeset-report-*.html` exists for the current branch under `.context/`, the new report covers only the changes since that prior report's `reportedSha` (read from the report's frontmatter comment). If no prior report exists, fall back to full-branch.

Write the report to `.context/changeset-report-{YYYY-MM-DD}-{slug}.html` (new file per invocation — never overwrite). Include the frontmatter comment described in the workflow (`generated`, `branch`, `scope`, `base`, `reportedSha`, `slug`, `plan`).

After the report is written, hand it to **Lavish** for interactive review (follow the `lavish` skill): run `npx -y lavish-axi <report.html>` to open it in the browser, `npx -y lavish-axi poll <report.html>` to wait for the user's annotations and queued prompts (fix any reported `layout_warnings` first), apply their feedback, then `npx -y lavish-axi end <report.html>` when review is done. Skip the handoff only when no report was written (empty delta) or when explicitly running non-interactively.

Print a one-paragraph summary when done, including: chosen filename, resolved scope (`delta` / `full` / `explicit-range`), base ref, prior report filename in delta mode, one-line totals.

## Rules

- Repository instructions (`CLAUDE.md`, `AGENTS.md`, `docs/constitution.md`) override home-level defaults.
- Never commit `.context/changeset-report-*.html` — the `.context/` directory is gitignored by convention.
- Each invocation produces a new dated file so prior reports accumulate as a session history. If the target filename already exists, make the slug more specific (first choice) or append `-2`, `-3`, … (fallback).
- If delta mode resolves to an empty diff (no new work since prior report), **do not write a new report** — echo a one-line note pointing at the most recent prior report instead.
- Follow the inline-SVG diagram rules in the portable workflow strictly (no Mermaid / charting library / CDN).
- Lavish is the review transport only — keep the report self-contained per the workflow (inline CSS / SVG, no CDN / Mermaid); do **not** restyle it with Tailwind / DaisyUI / Mermaid or apply Lavish's design playbooks.
- When invoked proactively (not via an explicit `/changeset-report` prompt), keep the post-run summary to one line so it doesn't compete with the main answer.
