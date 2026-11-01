# Global Engineering Preferences

These are portable personal defaults. Treat repository instructions as higher precedence whenever a repo provides `AGENTS.md`, `CLAUDE.md`, a constitution, or equivalent local guidance.

## Instruction precedence

1. System and runtime instructions
2. Repository instructions
3. Repository-local tool adapters and skills
4. These shared home-level defaults

## Cloud app handoff: choose the host port automatically

User instruction confirmed 2026-09-10: when hosting an app in a cloud workspace for me to test from my Mac, find an unused port on my Mac automatically and use that same port in the cloud. This explicit preference supersedes older repository or skill instructions that tell you to ask me which port is forwarded.

- Use Conductor's `RunLocalCommand` to probe the Mac; the cloud cannot determine which host ports are occupied. Have the host OS choose a candidate with a temporary TCP socket bound to port `0`, then check its availability on both IPv4 and IPv6 loopback. Release the probe sockets after checking.
- Check that exact port is also available on the cloud app's listening address. If occupied, choose another host candidate. Do not stop unrelated processes to free a port.
- Start the cloud app on the selected port and set its browser/auth origin to `http://localhost:<port>` (including `NEXTAUTH_URL` where applicable). Confirm the actual listener matches: startup scripts may silently select another port. If the app or forward encounters a collision, repeat discovery and restart with matching ports; a probe does not reserve the port.
- Use the same port for both ends of the forward. Configure it through available Conductor controls, or provide the exact mapping if I need to use the UI. Verify the forwarded URL from the Mac and the relevant auth flow before reporting the handoff ready; state clearly if forwarding still awaits UI setup.
- Do not ask me to choose or report a port when host discovery is available. If I already supplied a port, use it. Ask for a free host port only when `RunLocalCommand` is unavailable or cannot access the Mac, and explain that limitation.

This applies to a human browser handoff. Agent-only cloud QA uses the cloud server directly and must not be blocked on Mac forwarding.

## Local servers in cloud workspaces

- Conductor injects the workspace's real service secrets into the process env, which usually beats an app's `.env`. A mock or test mode that only flips feature flags can still reach real services. Override the credentials explicitly, and check the running process's environment (`/proc/<pid>/environ`) before calling a run mocked.
- Port pickers that shell out to `lsof` or `netstat` report every port as free when the tool is missing, as in the cloud sandbox. Probe by binding a socket, then confirm the actual listener.
- Stop only processes you started: record the process group at launch and kill that group, never by name.

## Response style

Be maximally succinct while retaining all relevant information. This governs every user-facing surface: chat replies, subagent reports handed back to the user, commit messages, and PR bodies.

**Core rules**

- Lead with the answer or outcome; put supporting detail after, and only if it changes what the reader does next.
- Omit preamble, restating the question, narrating tool usage, and hedging.
- Cut anything the reader can derive themselves (obvious next steps, generic explanations of well-known tools or concepts).
- Never drop substance to save space: keep exact error messages, file paths and line references, commands run, test results, trade-offs, and anything surprising or load-bearing.
- Prefer short prose over heavy structure; use headers, tables, or bullet lists only when they make the content faster to scan.
- Report results faithfully and plainly: failures with their output, skipped steps as skipped, successes without embellishment.
- Never refer to part of a spec, plan or map by its bare id (U0, K2, E8, FR-016, AG-003, §15). Give its name or a short description first, then the id in parentheses: "the catalog sign-off slice with Kera (U0)", "the confidence-tag order question for Kera (K2)". This applies to every user-facing surface, including chat replies, ticket comments and PR bodies.

**Default length by response type**

| Response type       | Default shape                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Direct question     | 1–3 sentences. Expand only when the answer genuinely has branches                                  |
| Completed change    | What is now true + the file:line entry points + the verification result. Nothing else              |
| Failure or blocker  | What failed, the exact error, and the single most likely cause or the question that unblocks it    |
| Investigation       | The finding first, then only the evidence that supports it                                         |

Going longer is a deliberate choice that needs a reason: real branching, a genuine trade-off the user must decide, or detail they explicitly asked for. Length is never a proxy for effort.

**Do not write**

- A step-by-step recap of work the user watched happen, or a list of changes that restates the diff.
- A closing summary after a response that is already short — the work speaks for itself.
- Sign-offs, offers of further help, or "let me know if…" trailers.
- Restating the plan before executing it, or re-explaining a decision the user already made.
- Caveats about limitations already stated, or self-assessment of the work's quality.
- Emphatic scaffolding — bold labels on every line, nested bullets one level deep, section headers over two paragraphs of content.

**Preserve regardless of length**

Exact errors, paths and line references, commands, test output, contradicted assumptions, and anything the user would be wrong without. When a response must choose, cut words rather than facts.

## General standards

- Do not use `any`. Define or discover a contextually correct type instead.
- Prefer named exports only.
- Do not use inline timeouts in E2E tests. Wait on observable UI conditions instead.
- Follow repo-native commands and workflows instead of inventing local alternatives.
- Keep repository-specific rules out of home-level docs and skills.
- Use the repository's PR template when opening pull requests.
- Finish all intended changes within a file before handing that file over for review.

## Design preferences

- Prefer functional composition over incidental abstraction.
- Duplicate until it hurts; do not abstract preemptively.
- Maintain framework-native patterns where they are required by the framework, even when the general preference is more functional.
- Use object parameters for functions with two or more meaningful inputs.
- Use positional parameters only for genuinely single-argument functions.
- Keep main functions and components at the top of a file, with helpers defined below their callers.
- Colocate types with the code that uses them. Avoid generic `types.ts`, `interfaces.ts`, and `utils.ts` files unless the repo already standardizes them.
- If a file exports one main function, prefer naming the file after that function.
- Only top-level use cases should receive dependencies; internal helpers should remain pure functions.
- Use cases should stay coarse-grained and represent a complete user intent rather than a narrow sub-step.
- Prefer guard clauses and early returns for simple conditional checks.

## Functional programming libraries

- Prefer the FP-focused library that the repository already uses, such as Effect, `fp-ts`, or `neverthrow`.
- If the repository does not already use one, prefer small local utilities over introducing a new FP library by default.
- Do not add a new FP library without explicit user approval.

## Error handling

- Prefer explicit error channels such as `Result`, `Either`, or typed unions when the repo uses them.
- Keep error types fully typed. Avoid `unknown` or stringly typed error channels for domain logic.
- Use discriminated unions for stateful or multi-branch domain errors.
- Do not throw for normal control flow unless a framework boundary requires it. Convert boundary exceptions into typed errors as soon as practical.

## Effect-TS pipelines

- Use growing context interfaces instead of `Effect.Do` with `Effect.bind`. Each pipeline step should accept the previous context and return an extended context.
- Define context types in the step file that creates them.
- Prefer a single top-level pipe declaration. When two-phase error handling is needed, use `Effect.flatMap` with an inner `.pipe()` to scope `mapError` rather than splitting the pipeline into separate pipe variables.
- Let steps accept the full context and pick what they need internally instead of mapping arguments at the orchestrator layer.
- Hide internal sub-steps behind higher-level pipeline steps and export only the top-level steps that the rest of the feature should compose.
- Encode relevant error context in the error payload with `mapError` instead of relying on mutable captured variables.

## Data and iteration

- Prefer `map`, `filter`, `reduce`, `flatMap`, and similar composition patterns over ad hoc loops when they keep the code readable.
- Use concurrency intentionally: parallelize independent async work and keep dependent steps sequential.
- Favor immutability by default, while allowing tightly scoped local mutation when it clearly improves readability.
- Do not enforce deep immutability mechanically with `Readonly<T>` and `ReadonlyArray<T>` at every level.

## Type guidance

- Prefer interfaces for object shapes.
- Prefer type aliases for unions, intersections, and utility types.

## React and UI defaults

- Put logic in custom hooks; keep components mostly declarative.
- Derive from server state whenever possible instead of mirroring it in client state.
- Use lightweight local state for simple UI concerns and state libraries only when the existing codebase already uses them for the same problem class.
