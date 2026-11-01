# Changeset Report Workflow

## Purpose

Generate a scannable technical review of a code changeset. Output is a self-contained **HTML** artifact for human review before commit, PR, or handoff — not a PR description, not a security audit, not a test run.

## Inputs (optional)

- `range`: explicit git ref range. Highest priority — bypasses all auto-detection.
- `--full`: force full-branch semantics (base = merge-base with the primary branch). Use when a reviewer needs a self-contained report on the whole branch.
- `--plan <path>`: path to a plan / spec markdown. When present, enables Traceability and Delta sections.

**Default behavior is delta mode**: if a prior report exists for the current branch, the new report covers only what's changed since that prior report. The command announces the resolved base and scope at the top of the report so the reader is never guessing.

## Output

Write to `<repo-root>/.context/changeset-report-{YYYY-MM-DD}-{slug}.html` (create the parent directory if missing). **Never overwrite an existing report** — each invocation produces a new file so prior reports accumulate as a session history.

- `{YYYY-MM-DD}` is today's date.
- `{slug}` is a short kebab-case description of the changeset's scope (≤ 5 words), derived from the dominant theme of the diff. Examples: `phase-2b-ui`, `auth-middleware-rewrite`, `429-rate-limit-fix`, `queue-alerting`.
- If the target filename already exists, make the slug more specific (first choice) or append `-2`, `-3`, … (fallback).

The report is a **single self-contained HTML file**: one inline `<style>` block, no external assets (Google Fonts is the only allowed remote link), no external JavaScript, and **no charting library / CDN** — all diagrams are inline SVG (see "Diagram rendering" below). Use a clean, consistent, scannable theme; prefer real `<table>`s for tabular data over ASCII.

Every report starts with this frontmatter block, embedded in an **HTML comment** immediately after `<!DOCTYPE html>` — the next invocation parses it (from the comment) to compute the delta base:

```html
<!DOCTYPE html>
<!--
generated: 2026-04-22T14:30:00-04:00    # ISO 8601 with timezone
branch: feature/plan-fragments
scope: delta                             # delta | full | explicit-range
base: a1b2c3d4                           # SHA or ref name used as the diff base
reportedSha: 9f8e7d6c                    # SHA that this report captures (see below)
slug: phase-2b-ui
plan: .context/attachments/plan-v1.md    # omit if --plan not supplied
-->
<html lang="en">
```

### How `reportedSha` is captured

Git's `stash create` produces a commit object representing the working tree + index without modifying any refs. That's the right snapshot to hash because it covers **committed + staged + unstaged** work. Resolution:

```bash
REPORTED_SHA=$(git stash create)
[ -z "$REPORTED_SHA" ] && REPORTED_SHA=$(git rev-parse HEAD)
```

The empty-fallback handles the clean-tree case. The resulting dangling commit lives in git's object store for ~30 days, long enough for any realistic session.

### Base ref resolution (in priority order)

1. Explicit `range` input → use it verbatim, scope = `explicit-range`.
2. `--full` → scope = `full`, base = merge-base with the primary branch (`main` unless absent).
3. A prior report exists for the current branch under `.context/changeset-report-*.html` → scope = `delta`, base = the most recent prior report's `reportedSha` (read from the frontmatter comment).
4. Otherwise → scope = `full`, base = merge-base with the primary branch.

### "No changes" early exit

If the computed delta is empty (`git diff --quiet $BASE $REPORTED_SHA` exits 0 and there are no untracked files in scope), do **not** write a new report. Echo a one-line note to the user pointing at the most recent prior report. This is the case when `/changeset-report` is invoked twice in a row with no work between.

## Phase 1 — Detect

- Resolve `reportedSha` via the stash-create recipe above.
- Resolve the base per the priority order in "Base ref resolution".
- Check the early-exit condition; bail out if empty.
- Collect: commit list, files touched, LOC delta, untracked vs. modified counts. All ranges are evaluated as `$BASE..$REPORTED_SHA` (plus untracked files under the same path set).
- Classify touched files by glob for Phase 3 decisions:

| Glob                                                    | Classification |
|---------------------------------------------------------|----------------|
| `**/migrations/*.sql`                                   | migration      |
| `**/*.schema.ts`, `**/schemas/**`                       | schema         |
| `**/*.use-case.ts`, `**/*.handler.ts`, `**/use-cases/**`| use-case       |
| `**/core/model/**`, `**/domain/**`                      | domain         |
| `**/*.spec.*`, `**/*.test.*`                            | test           |
| `**/index.ts`                                           | barrel         |

## Phase 2 — Core sections (always emit)

1. **Overview** — branch, scope (`delta` / `full` / `explicit-range`), base ref, `reportedSha`, commit count, file count, net LOC delta. In delta mode, also cite the prior report filename so the reader can stitch reports together.
2. **Public API delta** — for each touched barrel / `index.ts`, list added and removed exports. One-line description per export (from nearby JSDoc or a terse signature paraphrase).
3. **End-to-end data flow** — fires whenever the changeset crosses **≥ 3 architectural layers** (e.g., UI → tRPC → core/application → infrastructure → external; or UI → use case → repository → external). Skip only when the change is single-layer (e.g., pure refactor inside one library, single-component UI tweak, isolated test additions). When it fires, emit:
   - **An inline-SVG happy-path flow** through the changed surface, from a real entry point (user click, cron tick, incoming webhook) to the persisted result and any user-visible feedback. Make the temporal order explicit — this is the artifact that lets the reader hold the whole flow in their head before the per-function graphs zoom in. (For flows longer than ~12 steps, use an ordered step table instead of a hand-drawn lifeline — see "Diagram rendering".)
   - **A second flow (or step table) for an alternate / pre-existing path** when the changeset deliberately mirrors or replaces an existing flow (e.g., new pg-boss path next to an existing in-process path; new fragment pipeline next to a standalone-plan pipeline). Pair it with a **side-by-side comparison table** that makes the convergence point or divergence explicit.
   - **A "How information propagates" numbered narrative** under the diagram. One short paragraph per arrow group (≤ 7 entries). Each entry should explain *what data crosses the boundary and why*, not restate the diagram. Always convert relative dates into absolute dates if you cite events.
   - **An "Invariants the diagram makes visible" bullet list** with 3–5 properties the diagram surfaces but isn't obvious from any single file: single-resolution points, asynchronous boundaries, hard-fail vs. degrade modes, idempotency gates, the convergence function that multiple paths share.
   - See "Diagram rendering" below for the inline-SVG mechanics (layer grouping, palette, arrow conventions, async markers) — non-optional.
4. **Dependency charts (per function)** — emit **one inline-SVG dependency chart per function/class touched or added** in the diff, plus a final "Test surfaces" chart for any test/feature files. Do **not** combine everything into a single big chart — each chart is scoped to one symbol so the reader can scan responsibilities individually. For each chart:
   - **Center node** = the function or class the chart is about (focal/highlighted style).
   - **Outgoing edges** = what it calls, reads, writes, or branches on (collaborator functions, repositories, constants, fallback values, framework hooks). Collaborators that are themselves new/modified in this PR also use the focal style; pre-existing infrastructure (SDKs, repositories, framework tokens) uses the muted style.
   - **Edge labels** ≤ 3 words, describing the relationship (`calls`, `reads`, `delegates`, `fallback branch`, `LLM call`, `lookup project`, etc.).
   - **Group every node into its architectural layer** — non-optional (see "Diagram rendering"). A chart whose nodes don't show their layer boundary is a defect; even a single-layer chart should still show its one layer group so the reader can see at a glance that the symbol does not cross boundaries.
   - Section the charts under H3 sub-headers naming the function (e.g. `HazardProfileLeafContentProducer.produceContent (new)` or `setupDefaultCompositionRoot (additive change only)`), so the table of contents is meaningful.
   - If a function is trivially small (≤ 3 lines, no branching, no collaborators worth showing) and doesn't add information, skip its chart and note "no chart — trivial".
5. **Cyclomatic complexity** — prefer `npx eslint --rule '{"complexity": ["warn", 1]}' <touched .ts>` when the repo uses ESLint; fall back to reporting "N/A — no complexity tool detected". Group results by layer. Flag functions ≥ 10 as "review candidate"; > 15 as "over threshold".
6. **Test scenarios** — enumerate each `*.spec.*` / `*.test.*` file in the diff and list the `describe` / `it` / `test` descriptions as bullet points. Group by layer. Do **not** run the tests.
7. **Summary scorecard** — qualitative one-line assessments: plan fidelity, layer discipline, test coverage, merge safety, etc. Any dimension not checked by this tool gets "N/A — not checked".

## Phase 3 — Conditional sections

Fire when Phase 1 classification indicates:

| Section                | Fires when                                       |
|------------------------|--------------------------------------------------|
| DB Schema + Migration  | migration or schema files touched                |
| Use-Case Catalog       | use-case files touched                           |
| Domain-Model Snapshot  | domain / core-model files touched                |
| Traceability Matrix    | `plan` input supplied                            |
| Delta vs. Plan         | `plan` input supplied with explicit deliverables |

Each conditional section has a fixed template; inline it only when the detector fires. If zero conditional sections fire, that's fine — the core sections are the baseline.

## Phase 4 — Write output

- Write to a new `.context/changeset-report-{YYYY-MM-DD}-{slug}.html` file with the frontmatter comment populated.
- Echo to the user: output filename, scope (`delta` / `full` / `explicit-range`), base ref, sections emitted, sections skipped (and why), one-line totals (test count, complexity max, files touched). In delta mode, also cite the prior report so the reader sees the chain.

## Phase 5 — Review handoff (Lavish)

After the report file is written, hand it to **Lavish** so the static report becomes an interactive review surface the user can annotate and send feedback through. The report HTML is the input to `lavish-axi` as-is — Lavish serves it; it does not regenerate or restyle it.

1. `npx -y lavish-axi <report.html>` — open / resume the review session in the browser.
2. `npx -y lavish-axi poll <report.html>` — long-poll for the user's annotations, queued prompts, and browser-reported `layout_warnings`. Leave it running; never kill it. If the poll reports `layout_warnings`, fix the overflow / clipped text in the report HTML and re-check before involving the human.
3. Apply the user's feedback (edit the report HTML, or the underlying changeset, as appropriate), then poll again with `--agent-reply "<message>"` to reply in the browser and keep the loop going.
4. `npx -y lavish-axi end <report.html>` when the review is finished.

**Boundary** — Lavish is the review/feedback transport, **not** the artifact generator. Keep the report self-contained per the "Output" and "Diagram rendering" rules (inline CSS, inline SVG, no CDN, no Mermaid, no charting library). Do **not** apply Lavish's design or diagram playbooks (Tailwind / DaisyUI / Mermaid) to the report — the report's own rendering rules take precedence.

**Skip this phase** when no report was written (empty-delta early exit) or when explicitly running headless / non-interactively (e.g., a proactive CI-style invocation with no browser available).

## Diagram rendering (inline SVG)

All diagrams are **hand-built inline `<svg>`** embedded directly in the report HTML — **no Mermaid, no charting library, no external JS, no CDN**. This renders identically online and offline (including over `file://`) and gives full control over the house style.

General rules:

- Wrap each diagram in a card: `<div class="diagram"><svg viewBox="0 0 W H" role="img" aria-label="…">…</svg></div>`, with CSS `.diagram svg { width: 100%; height: auto; }` so it scales to the column.
- **Nodes** = `<rect rx="9">` + a centered `<text>`. **Edges** = `<line>` / `<path>` referencing a shared `<marker>` arrowhead (`markerUnits="userSpaceOnUse"`, `orient="auto"`). **Labels** = `<text>` in a monospace font, ≤ 3 words.
- **Set `fill` and text color explicitly** on every node and label, so the diagram is legible regardless of the page theme. Never rely on default text color over a pale fill.
- Prefer a **vertical (top→bottom) flow** — it leaves room for an edge label beside each arrow. Use curved Bézier `<path>`s for branch / back edges that skip a level.
- **Group nodes by architectural layer and make the grouping visible** — either a labeled bounding `<rect>` behind each layer's nodes (with a small layer caption) or a per-layer node fill. This is the report's single most useful layer-discipline cue; a diagram whose nodes cross layers without showing the boundary is a defect.
- Keep a diagram under ~20 nodes; if larger, split it (happy path / alternate / failure) rather than cramming one frame.

**Layer vocabulary + palette** — reuse across every diagram so the reader's color memory carries over:

| Layer                 | Fill      | Stroke    |
|-----------------------|-----------|-----------|
| UI / tRPC client      | `#e5e7eb` | `#6b7280` |
| tRPC server           | `#e5e7eb` | `#6b7280` |
| core/application      | `#fef3c7` | `#b45309` |
| core/model            | `#bae6fd` | `#0369a1` |
| infrastructure        | `#fde68a` | `#b45309` |
| external + framework  | `#bae6fd` | `#0369a1` |
| persistence           | `#e5e7eb` | `#6b7280` |

(For a dark-themed report, use the dark house palette instead: panel `#11161f`, muted stroke `#5b6478`, amber `#ffb454` for the focal/changed node and edge labels, green `#34d399` for terminals.)

**Arrow conventions** (encode call semantics in the stroke, since SVG has no message types): solid line = synchronous call/flow; dashed line (`stroke-dasharray`) = fire-and-forget / async dispatch (queue send, event-bus emit, SSE push, daemon fork) or a loop-back edge; give async/loop-back edges a distinct accent color. Note surprising invariants (auth gates, "request returns now", retry policy) as a small `<text>` callout beside the relevant edge — sparingly.

### End-to-end data flow

The happy path is a vertical inline-SVG flow from a real entry point to the persisted result, layer-colored, with ≤3-word edge labels and the async markers above. **For flows longer than ~12 steps a hand-drawn lifeline is impractical — use an ordered step `<table>` instead** (columns: step #, layer, actor → action, data crossing the boundary). Either representation is paired with the "How information propagates" narrative and the "Invariants the diagram makes visible" bullets (both non-optional).

### Per-function dependency charts

One small inline-SVG graph per touched/added function or class: the focal symbol as the center node (focal style), outgoing edges to what it calls / reads / writes / branches on, every node placed inside its layer group. New/modified collaborators use the focal style; pre-existing infra uses the muted style. A flat chart with no visible layer grouping is a defect.

## Non-goals

- Does not run tests. Test counts come from enumeration of `describe` / `it`.
- Does not evaluate correctness or security. Use `/review` for that.
- Does not produce a PR description or commit message.
- Does not load repo-local extensions. The core workflow is fully generic; repo-specific conventions are observed via file globs, not configuration.

## When to invoke

- **Proactively**, when a coherent unit of work has been completed (feature, refactor, multi-file bug fix) and the user is likely to review, commit, or share the diff next.
- **On explicit user request**: `/changeset-report`, `/changeset-report main..HEAD`, `/changeset-report --full`, or `/changeset-report --plan specs/008-feature.md`.
- **Skip proactive invocation when**: the change is a single-file fix, the user is in the middle of a multi-step task, or a prior report in this session is still current.
