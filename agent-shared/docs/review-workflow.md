# Review Workflow

Use this workflow for portable code review behavior across tools.

## Setup

1. Read repository instructions first: `AGENTS.md`, `CLAUDE.md`, `docs/constitution.md`, and any nearby module instructions that apply to the changed files.
2. If the repository provides a review-specific or code-structure skill, load that before falling back to this document.
3. Review changed files only unless the user explicitly asks for a broader audit.

## Review priorities

Review for real defects and maintainability risks first:

- behavioral regressions
- missing or weak tests
- type-safety violations
- architectural boundary violations
- single-responsibility and cohesion problems
- import and module-format issues required by the repo
- unclear naming or structure that materially harms maintainability

## Review checklist

- Verify the code follows repository architecture boundaries.
- Check that new functionality has the right test coverage for the layer being changed.
- Prefer contract-focused tests over implementation-detail assertions.
- Flag `any`, unclear error types, and untyped failure paths.
- Verify file and function organization reads top-down and keeps helpers below their callers.
- Check that relative imports follow the repo's ESM rules when applicable.
- Watch for generic utility dumping and other low-cohesion module structure.

## Response shape

1. Findings first, ordered by severity.
2. Include file references and concrete fixes.
3. Separate open questions or assumptions from findings.
4. Keep the summary short and secondary.
5. If no findings are present, say so explicitly and mention any residual risks or testing gaps.
6. Treat GitHub review submission as a separate, user-confirmed step: prepare findings and a recommended disposition, but do not approve or request changes until the user explicitly asks.

## Severity model

- Blocking: must fix before merge because correctness, architecture, type safety, or required tests are compromised.
- Should Fix: important maintainability or clarity issue that is not an immediate correctness blocker.
- Suggestion: optional improvement with limited risk.
