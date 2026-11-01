---
description: Ship a feature or a GitHub epic. Opus 5.5 (high effort) leads: architect briefs, one Sonnet 5.5 Conductor session per package on the /iterate rails (own worktree, landings on one integration branch, one dev server, a scripted gate), live Chrome verification, code and UI/UX review loops, then one draft PR.
argument-hint: [feature description, plan/spec path, GitHub issue/epic, or empty to continue current work]
model: claude-opus-5-5
effort: high
---

## Input

```text
$ARGUMENTS
```

Treat the input as **what to ship**:

- a feature description or a path to a plan/spec → single-feature mode
- a GitHub issue or epic reference (`#123`, an issue URL, "epic 123") → **Epic mode** (section below)
- a beads map or ticket id (`abc-12`, `abc-12.3`) → **Map mode** (section below)
- empty → check for a map first: if `bd where` resolves and `bd list -l wayfinder:map` shows an open map matching this branch's work, name it and enter **Map mode**. Otherwise, if `iter status` shows a run, continue it. Otherwise continue the work already in progress on this branch.

If the input is a question rather than something to ship, answer it and ask what to ship. If the scope is unclear, ask one clarifying question before starting; otherwise begin.

# /ship: architect → spawn → verify → review → one PR

You are the **lead**: architect and quality gate, not typist. Every package is built by its **own Conductor session**, in its own git worktree, on the rails of `/iterate`.
- Sessions land their commits on one **integration branch**, which one dev server serves.
- A scripted **gate** runs the repo's check on that branch once landings go quiet.
- The user can open any package's session and talk to it directly. That is the point: no package is built by an invisible subagent.

`iter` below means `node ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/iterate/scripts/iter.mjs`, the script `/iterate` uses. It does everything deterministic: worktrees, sessions, landing, the gate and its debounce, the dev server, the heavy-job lock, and a guard hook for implementers. `iter help` lists its commands. Read `skills/iterate/SKILL.md` once per run for its rules on the server, watch events and closing items; this command adds the phases around them.

| Work | Who |
|---|---|
| Architecture, briefs, diff review at each READY, user decisions, the PR | You (inline) |
| Implementation and fixes, one package each | A Conductor session from `iter spawn` on `sonnet-5-5-1m` at `medium` effort |
| Chrome driving (live verify and UI/UX review) | `browser-verifier` agent; fallback `claude` with `model: sonnet` |
| Code review | `code-review-best-practices` agent; fallback `claude` with `model: sonnet` |

**Always spawn.** Even a one-file change gets a package and a session, so every run has one the user can open.

**The main checkout is integration-only.** Nobody edits files there, you included. All code changes happen in package worktrees.

**Trust nothing reported.** A session's `READY` is a claim. Read the landed diff yourself, and let the gate (not a session's word) decide that the repo's check passes.

**Ask with the tool.** Ask every decision the user must make with `AskUserQuestion` (`mcp__conductor__AskUserQuestion` in Conductor), batching the open ones into one call: product calls a session raised, deviations to accept, review-gate acceptance. Conductor shows only your last message, so a question inside a status update gets buried. A reply to a watch event is one line and asks nothing.

**Pre-authorized, no need to ask:** messaging sessions, `iter` landings and gates, and grouping review findings into one fix round.

Each loop below has a **hard cap of 5 iterations**. If a loop hits the cap without converging, STOP, summarize what is still failing, and ask how to proceed.

---

## Phase 0: Architect (you, inline)

Read the plan or spec and just enough code to fix the seams, no more. Then:

1. **Split the work into packages** in dependency order. Each package is one change you can judge on its own, and it compiles and tests on top of the packages before it. A genuinely atomic change is one package. Keep two requests in one package when they change the same files; `iter status` flags overlaps, so a split you got wrong shows up there.
2. **Decide the contracts:** types, signatures, API shapes, file placement, patterns to follow.
3. **Write one brief per package** to a temp file, with these sections:
   - **Goal:** the behaviour, one paragraph.
   - **Contract:** the interfaces, types, signatures and placement you have decided. Not up for redesign.
   - **Scope:** files in scope, and what is explicitly out of scope.
   - **Exemplars:** named files whose shape to match.
   - **Tests:** what to add or update, and where.
   - **Verify:** the focused commands that must pass, and what to check in the browser.
   - **Footguns:** repo-specific constraints that apply to this package.
   - **Done looks like:** what the user will see in the app.
4. **Mark review-gated packages.** A package is review-gated when the ticket, plan or user says the user reviews it before it closes.

For a new UI surface, build a throwaway prototype and look at it before you write briefs. Pin **decisions, not transcripts**: don't pre-read files on the implementer's behalf, because it does its own discovery inside the rails you set.

## Phase 1: Start the run and spawn (you, with `iter`)

1. **Start the run.** From the main checkout, run `iter init` (add `--integration <branch>` when the integration branch is not the checked-out one). Then `iter server status`, and `iter server up` when no iter server runs; give `--port` when the user will open it through a port forward. When it reports a server iter did not start, ask the user before stopping it. If `init` reports no repo config, read `skills/iterate/repos/README.md` and write one first.
2. **Write the ship duties** once per run to a temp file, `ship-extra.md`, and pass it to every spawn with `--extra`:

   > ## Ship duties
   > - The brief's **Contract** and **Scope** are decided. If the code makes one wrong, stop and say so in your reply instead of redesigning.
   > - Add or update the tests the brief names, test first where you can, and run the brief's **Verify** commands before each READY.
   > - Your READY reply lists:
   >   - files touched;
   >   - commands run, with their results pasted;
   >   - decisions you made;
   >   - deviations from the brief, with reasons;
   >   - open questions.
   > - **Review-gated items only:** before READY, record screenshots **and** a 30–60 second screen recording of each changed interaction, and copy them with `cp` from your worktree to `<main checkout>/.context/review/<slug>/` (the Write tool cannot write outside your worktree, and `iter done` deletes the worktree). List the paths. Then wait in this session. The user reviews here and may ask for changes; only the user's acceptance closes the item.

   Replace `<main checkout>` with the real path when you write the file.

3. **Spawn in dependency order.** For each package whose dependencies have landed:

   `iter spawn <slug> --brief <file> --extra ship-extra.md --model sonnet-5-5-1m --effort medium --title "<package title>"`

   Add `--review-gated` for review-gated packages. Packages with no dependency between them spawn together. A package that depends on another spawns when that one has landed and you have accepted its diff.
4. **Tell the user** in one table: each package's slug, what it covers, whether it is review-gated, and its session link. Say that they can message any session directly.

## Phase 2: While sessions run (you, loop ≤5 per package)

1. **Run `iter watch` detached, and arm the Monitor tool on a tail of its log**, as `skills/iterate/SKILL.md` describes. Keep the Monitor armed. Never arm it on `iter watch` directly, because an expiry kills the gate the watch started. The watch starts the gate, and prints only what you act on: a session going idle, a landing, a gate result, a new overlap, the server going down.
2. **When a session replies `READY <sha>`, gate it:**
   - **Diff:** read the package's landed diff (`git diff <previous landing>..<sha>` on the integration branch) as an expert reviewer: architecture, seams, idioms, repo footguns, test honesty.
   - **Browser:** spawn a `browser-verifier`. Tell it to:
     - load the `mcp__claude-in-chrome__*` tools via `ToolSearch`;
     - work against the iter server URL, on the brief's **Done looks like**;
     - seed realistic data when the path needs it;
     - report evidence: actions, what the screen showed, console errors, side effects such as DB rows or persisted output;
     - never edit code, and restore any state it mutates.

     Size the check to the risk: a pure move gets one comparison against trunk and a smoke check; a behaviour change gets one check per state it touches. Where the repo has `.agents/playbooks/risk-sized-verification.md`, follow it.
   - **Fixes** go to the package's session as precise `file:line` instructions: `conductor message create --session <id> --message "..."`. A structural miss means your brief was wrong: revise it and send it as the next round.
3. **Gate failures.** On `gate FAIL`, the gate has already sent the log to every session it names. When it names more than one, read the log, work out whose change broke it, and tell that session. When it names none, the failure predates the run, so tell the user. `iter gate` checks the current head at once.
4. **Idle sessions.** When a session goes idle without landing, read its last message (`conductor session message <id>`) and either answer it or ask the user.
5. **Server down.** Read `iter server logs`, then `iter server up`. A blank or stale page after landings usually means a poisoned bundler cache: restart the server rather than chasing a phantom.
6. **Escalation.** After 2 failed fix rounds on a package, tell the user and offer to take the package over yourself in its worktree. Never launder a hard problem through more rounds.

A package is **accepted** when its diff reads clean, the browser check shows it working with a clean console, and the gate is green on its last landing. Spawn its dependants then.

## Phase 3: Code review (loop ≤5)

When every package is accepted, review the whole changeset once.
1. **Spawn the reviewer.** Spawn `code-review-best-practices` with:
   - the feature;
   - `git diff <run base>..<integration head>`;
   - what is already verified;
   - a request for findings tagged blocker, should-fix or nice-to-have, each with `file:line` and a concrete fix.

   It must not edit code, and must never run `git checkout`, `git switch` or `git reset` in the main checkout: that detaches the integration branch, and `iter land` refuses until it is reattached. To read code at a commit, use `git show <sha>:<path>` or `git diff`. Put the same rule in every re-review message.
2. **Adjudicate** the findings yourself. You are the architecture authority: overrule findings that are wrong for this codebase, with a one-line reason each.
3. **Fix.** Send the accepted fixes to the owning packages' sessions, one grouped message each. They land, and the gate reruns.
   - Group the fixes by the files they touch, not by theme. Fix sessions that share files must land in a strict order, and each one rebases on the last.
   - Before sending, list each group's files. Merge any two groups that overlap into one session.
   - No browser check is due while code fixes run, so stop the dev server for the round (`iter server down`) and give its memory to the gate and the sessions' checks.
4. **Re-review.** Send the resolutions back to the same reviewer to confirm each is resolved and nothing new appeared. A round is clean when it has no blocker and no should-fix finding; nice-to-haves go to the report's open items. Where the repo defines its own rule (IEM: `CODING_STANDARDS.md` "When review stops"), use it. If a fix causes a new regression, stop and ask.

## Phase 4: UI/UX review (loop ≤5)

Only if the change has a UI surface; otherwise skip it and say why.

1. **Spawn the reviewer.** Spawn a `browser-verifier` against the iter server, telling it where the feature is. Ask for prioritized findings on:
   - clarity, hierarchy and affordances;
   - consistency with sibling UI;
   - empty, loading and disabled states;
   - accessibility;
   - anything confusing or broken.

   It must not edit code, and must restore any state it mutates.
2. **Adjudicate and fix.** Weigh the findings against the code-review guidance, note deliberate trade-offs, and send the fixes to the owning sessions.
3. **Re-verify** with the same agent until clean (the Phase 3 rule) and the feature still works.

## Phase 5: One draft PR (you, inline)

1. **Gate green.** Wait until `iter status` shows the gate green on the integration head and no package with unlanded commits. Run the repo's build for the touched apps yourself (for example `nx build <app>`), through `iter heavy -- <command>`.
2. **Review gates.** For each review-gated package, ask the user with `AskUserQuestion` whether they accept it, pointing at its session and `.context/review/<slug>/`. A package the user sends back returns to Phase 2.
3. **Close items.** Run `iter done <slug>` for each accepted package, with `--accepted` for review-gated ones. Never pass `--accepted` without the user's answer.
4. **Push and open the PR.**
   - Push with `iter push`, which pushes the last green commit.
   - Open one draft PR from the integration branch to the repo's base: `gh pr create --draft` with a body that follows the repo's PR guidance.
   - The body lists each package, its session link and what was verified, plus `Closes #<n>` for each ticket the run ships.
   - End commit messages and the PR body with the repo's required trailer and attribution lines.
5. **Stop at the outward-facing edge.** The PR stays a **draft**; report its link. Do not mark it ready for review and do not comment on issues, since both notify people, unless the user asks.

---

## Epic mode

The input references a GitHub epic: an issue whose body lists child tickets, or one carrying an initiative label.

1. **Discover.** `gh issue view <n>` the epic. Collect child tickets from the body's task list and issue references; the fallback is the epic's `initiative:*` label (`gh issue list --label <label> --state open`). Read every ticket. If discovery is ambiguous, show the ticket list and confirm once before starting.
2. **Triage (you, inline).**
   - Order tickets by dependency, and spot cross-ticket contracts and shared seams now, so the tickets converge on one architecture.
   - Write `.context/ship-epic-<n>.md` with the ticket order, a status table and the cross-ticket decisions. The table has, per ticket: phase reached, session link, landed SHAs, review-gated, blockers.
   - Update the file after every phase. It and `iter status` are your durable state across context summarization.
3. **One package per ticket by default**, one session each. Split a ticket into several packages only when its own seams demand it. Run Phases 0–4 across the tickets on one run (one integration branch, one server, one gate), spawning each ticket when its dependencies are accepted.
4. **Blockers.** If a ticket caps out or needs user input, record it in the progress file. If no remaining ticket depends on it, continue with the rest and surface it in the final report; otherwise ask.
5. **One PR at the end** (Phase 5), with `Closes #<ticket>` for each ticket it ships.
6. **Resume.** If `.context/ship-epic-<n>.md` and an iter run exist, continue from the first unfinished ticket; message existing sessions rather than respawning them.

## Map mode

The input references a **wayfinder map**: a beads epic labelled `wayfinder:map` whose children are the tickets. Tracker mechanics (frontier, claim, resolve, sync) live in `~/.agent-shared/docs/beads-issue-tracker.md` § Wayfinding operations; follow them for every tracker write.

1. **Discover.** `bd show <map>` for the destination and decisions so far, and `bd children <map>` for the tree. Only `wayfinder:task` children are shippable; anything else needs the user (see **Human-in-the-loop tickets** below).
2. **Triage (you, inline)** as in Epic mode. The progress file is `.context/ship-map-<map>.md`.
3. **Loop over the frontier** (`bd ready --parent <map> -u`):
   - **A `wayfinder:task` ticket:** claim it (`bd update <id> --claim`) and spawn it as a package with the ticket's `## Question` body in the brief. When it is accepted (and, if review-gated, accepted by the user), record the outcome on the ticket (`bd comments add <id>` with the session link, landed SHAs and what was verified), then `bd close <id> --reason resolved` and `bd dolt push`.
   - **Any other kind:** the hand-off below.
   - Add `Closes #<n>` to the PR only when the ticket names a GitHub issue.
4. **Human-in-the-loop tickets.** A `wayfinder:research|prototype|grilling` ticket is answered by the user, not you.
   - Leave it unclaimed and open a session for it in **this** workspace: `conductor session create --agent claude --name "<ticket-id>: <title>" --message "<the ticket id and its Question; run the matching skill (/research, /prototype, /grilling) interactively with the user; keep artifacts under .context/; on resolution follow the wayfinding Resolve row>"`.
   - Give the user the session's **deep link**.
   - Keep shipping frontier tasks meanwhile. When none remain, poll `bd show <id> --json` on a few-minute cadence (Monitor or an `until` loop, never a bare `sleep`) until the ticket closes, then re-read the frontier.
5. **Blockers.** Comment the blocker on the ticket, leave it claimed, note it in the progress file, and keep looping. Ask only when the frontier is empty while open tickets remain and none of them are out with the user.
6. **Resume.** A ticket claimed by this git user and `in_progress` is yours: finish it (message its session) before taking new frontier work.

## Report

Close with:
- the PR link, its base and file count;
- one row per package: slug, session link, landed SHAs, review-gated and the user's verdict, iteration counts of its fix and review loops;
- what was verified: the gate, the build, the browser checks;
- models used and any escalations;
- open items: draft status, the running dev server, deferred findings, sessions still open.

In Epic and Map mode, include the per-ticket status table.
