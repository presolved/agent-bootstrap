# Spec Workflow

Portable workflow for the spec phase: turn an idea into a reviewable, high-level spec through a context-extraction discussion. The spec captures **what and why**, never how. The user's attention is the scarce resource — every question must earn its slot.

## Modes

- **New** — no spec exists for the idea. Run all phases below.
- **Resume** — a spec exists and the user wants to continue. Read the spec, skip to Phase 3 with a new dated clarification session.
- **Review** — a spec exists but was authored elsewhere (another agent, another workspace). Read the spec and any architecture docs it references, run Phase 0 research, then start with the Phase 4 adversarial pass and feed its findings into Phase 3 clarification rounds. Edit the spec in place; record decisions as a new dated session.

## Phase 0 — Research before asking

Before the first question reaches the user, sweep what is already knowable:

- Repo instructions (`CLAUDE.md`, `AGENTS.md`, `docs/constitution.md`).
- Prior specs in the repo's spec directory — especially adjacent features.
- Architecture or proposal docs relevant to the idea.
- The user's knowledge base / wiki when available.

Never ask the user something this research can answer. Reserve their bandwidth for what is only in their head: intent, priorities, business constraints, tradeoff calls, and which prior art is canonical versus abandoned. Questions must cite findings ("there are two generation paths — X and Y; which one?") instead of fishing.

## Phase 1 — Intake interview (adaptive depth)

Open-ended questions before any drafting. Scale depth to the feature:

- **Small or well-precedented idea**: 2–3 broad questions, then draft.
- **Vague, novel, or cross-cutting idea**: keep interviewing until the goal, users, and scope boundaries can be stated without guessing.

Core intake questions: what problem, and why now; who is it for and what is their journey; what does success look like; what is explicitly out of scope; what known constraints apply; what is the user unsure about or worried will fail (often the richest answer).

## Phase 2 — Draft early

Do not interview to exhaustion — a concrete draft is a better question-generator than a blank page. Once goal, users, and scope can be stated without guessing:

1. Infer the next spec path from the repo's convention (e.g., highest `specs/NNN-slug` + 1, short kebab slug). **Propose the path to the user before writing.** Do not create branches or manage git state — the user owns that.
2. Use the repo's spec template when present (e.g., `.specify/templates/spec-template.md`); otherwise mirror the structure of the most recent spec in the repo.
3. Include an **Architecture Alignment** section whenever a relevant architecture or proposal doc exists, stating how the feature maps onto it and any deliberate deviations under test.
4. Mark genuine unknowns inline with `[NEEDS CLARIFICATION: …]` instead of inventing answers.

## Phase 3 — Convergent clarification rounds

Scan the draft against a coverage taxonomy: functional scope, actors and permissions, data and entities, integrations, failure and edge cases, non-functionals, transition/lifecycle rules. Rank gaps by impact on scope or architecture, then ask in small batches:

- **Multiple-choice-heavy**: every question ships with concrete, research-derived options, recommended option first. The user can always answer free-form.
- ≤4 questions per round when using a structured question UI; ≤5 in plain chat. Use a structured question UI when the environment provides one, but never depend on it.
- Encode every answer twice: into the spec body, and into a dated `## Clarifications` session log (`### Session YYYY-MM-DD`, `- Q: … -> A: …` lines).
- Stop when answers stop changing the spec — two consecutive rounds yielding only minor edits means move to Phase 4.

Rounds may span days and agents; the spec file carries all state, never the chat.

### Altitude control and the parking lot

When ideation surfaces implementation detail, do not discard it and do not let it into the spec body:

- Park the raw detail in the workspace `.context/` directory (e.g., `.context/plan-notes-NNN-slug.md`). It is ephemeral and per-workspace.
- If the plan phase must know a deferral happened, also encode it as a clarification entry ("mechanism left to the plan phase") so the committed spec carries the decision even when `.context` does not survive.

## Phase 4 — Adversarial pass

Before declaring the spec ready, attack it:

- Contradictions between sections.
- Untestable or unmeasurable requirements.
- Unstated assumptions presented as facts.
- Requirements with no covering acceptance scenario, and scenarios with no requirement.
- Missing failure modes and edge cases.
- Scope creep into "how" territory.
- Leftover `[NEEDS CLARIFICATION]` markers.

Fix what the spec's own content already answers; surface the rest as one final question round. There is no separate checklist artifact — this pass plus the human gate is the readiness bar.

## Gate

The spec goes to the user for review as a PR diff. The user owns branches, commits, and the PR. The spec phase is done when the user approves; the plan phase consumes the approved spec.

## Rules

- Repository instructions override this home-level workflow.
- The spec states what and why only — no tech stack, schema, or endpoint decisions.
- Never create branches, switch branches, or open PRs unless explicitly asked.
- Never spend a user question on something research can answer.
- All durable state lives in the committed spec file; `.context/` holds only ephemeral, workspace-local notes.
