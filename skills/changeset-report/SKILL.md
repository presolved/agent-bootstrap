---
name: changeset-report
description: Generate a scannable technical review of the current changeset, then open it in Lavish for interactive browser review. Invoke proactively when a coherent unit of work (feature, refactor, multi-file bug fix) is complete and the user is about to review, commit, or share the diff. Manual invocation via `/changeset-report [range] [--full] [--plan <path>]`. Defaults to delta mode so successive reports don't duplicate.
---

# Changeset Report Skill

Proactive capability for producing a review artifact under `.context/`. Each invocation writes a **new** dated file — prior reports stay on disk so a session can accumulate a history of reviewed changesets.

Reports default to **delta mode**: each new report covers only what changed since the prior report on the current branch. Pass `--full` (or an explicit `range`) when you want a whole-branch report instead.

The report is a self-contained HTML artifact. After it's written, hand it off to **Lavish** (the `lavish` skill) so the user can review it in the browser, annotate elements, queue prompts, and send feedback back. The report file is the input you pass to `lavish-axi` as-is — Lavish serves it, it does not regenerate or restyle it.

## When to invoke

- A feature / refactor / bug fix just landed across multiple files and the user has signaled completion (says "done", starts asking about commit / PR, or switches context).
- You completed a long multi-step task and the user would benefit from a summary before reviewing the diff.

## Skip proactive invocation when

- The change is a single-file tweak.
- You're mid-task and the change set is incomplete.
- A prior report in this session is still current (no substantive changes since). In delta mode this is enforced automatically — the workflow exits without writing a file when the delta is empty.

## How to run

1. Read `~/.agent-shared/docs/global-engineering.md`.
2. Read `~/.agent-shared/docs/changeset-report-workflow.md`.
3. Read repo `CLAUDE.md` / `AGENTS.md` if present.
4. Invoke the `/changeset-report` command (optionally with a git range, `--full`, or `--plan <path>`), OR execute the portable workflow directly if the command is unavailable.
5. Hand the written report to **Lavish** for review (follow the `lavish` skill): run `npx -y lavish-axi <report.html>` to open it in the browser, then `npx -y lavish-axi poll <report.html>` to wait for the user's annotations and queued prompts, apply their feedback, and `npx -y lavish-axi end <report.html>` when the review is done. Skip this step only when the delta is empty (no report written) or when explicitly running headless / non-interactively.

## Rules

- Write the report — don't leave it in conversation only.
- Follow the inline-SVG diagram rules in the portable workflow without shortcuts (no Mermaid / charting library / CDN).
- **Output path**: `.context/changeset-report-{YYYY-MM-DD}-{slug}.html`. Never overwrite an existing report — pick a more specific slug (or append `-2`, `-3`, …) if the filename already exists.
- The slug is a short kebab-case description of the changeset's scope (≤ 5 words), e.g. `phase-2b-ui`, `auth-middleware-rewrite`, `429-rate-limit-fix`. Derive it from the dominant theme of the diff.
- Every report must include the frontmatter comment described in the workflow (`generated`, `branch`, `scope`, `base`, `reportedSha`, `slug`). The next delta-mode invocation reads `reportedSha` (from the leading HTML comment) to compute the base.
- If delta mode resolves to an empty diff, **do not write a new report** — echo a one-line note and point at the most recent prior report. (No report ⇒ no Lavish handoff.)
- After writing the report, open it in **Lavish** for interactive review (see "How to run" step 5 and the `lavish` skill). Pass the report file to `lavish-axi` as-is; if `poll` reports `layout_warnings`, fix the overflow / clipped text in the report HTML and re-check before involving the human.
- **Lavish is the review transport, not the artifact generator.** Keep the report self-contained per the portable workflow (inline CSS, inline SVG, no CDN, no Mermaid, no charting library) — do **not** rewrite it into Tailwind / DaisyUI / Mermaid or apply Lavish's design or diagram playbooks. The report's own rendering rules take precedence over Lavish's default design guidance.
