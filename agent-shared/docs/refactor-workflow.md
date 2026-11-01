# Refactor Workflow

Use this workflow when the task is to improve structure without changing behavior.

## Setup

1. Read repository instructions first.
2. Identify the existing contract: user-visible behavior, public APIs, persistence shape, and current tests.
3. Prefer repository-local refactor guidance over this shared default when it exists.

## Refactor goals

- Preserve behavior unless the user explicitly asks for a behavior change.
- Improve functional cohesion and single-responsibility boundaries.
- Make the main flow easier to read from top to bottom.
- Reduce incidental coupling and make dependencies more obvious.
- Strengthen or maintain test coverage around the preserved behavior.

## Scope mode

Refactors run in one of two scope modes:

- `single-file`: keep the refactor inside the requested file
- `allow-split`: allow tightly scoped extraction into nearby files when needed for SRP or cohesion

Default to `single-file` unless the user explicitly indicates otherwise.

In `single-file` mode:

- Preserve behavior while improving structure only inside the target file.
- Do not create new files or move helpers, types, or modules into neighboring files.
- If a fuller SRP cleanup would require splitting the file, treat that as a follow-up recommendation rather than part of the current refactor.

In `allow-split` mode:

- Preserve behavior while allowing tightly scoped extraction into nearby files when that materially improves SRP, cohesion, readability, or architecture.
- Keep new-file creation minimal and limited to the requested feature or module.
- Continue to respect repo architecture boundaries, import conventions, and local module structure.

## Preferred moves

- Extract well-named helper functions from mixed-responsibility code.
- Split modules that have multiple reasons to change.
- Convert methods to standalone functions when they do not need shared instance state.
- Keep types close to the feature that owns them.
- Replace generic utility buckets with feature-specific modules when the extraction is justified.

## Constraints

- Do not introduce new abstractions unless they simplify a real repeated pattern.
- Keep signatures and call sites stable unless the change is part of the requested refactor.
- Respect repository import rules and architecture boundaries.
- Avoid changing unrelated files just because they can be cleaned up at the same time.
- If the user does not specify a scope mode, do not ask just because splitting might help; use `single-file`.
- If the user gives contradictory scope instructions, resolve the contradiction before editing.

## Verification

- Run the narrowest tests that prove behavior was preserved, then run any broader repo checks required by local instructions.
- If coverage is missing for the refactored behavior, add or strengthen tests at the right layer.
