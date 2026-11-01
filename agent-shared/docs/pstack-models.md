# pstack model configuration

Per-role model overrides for pstack skills. Each pstack SKILL.md names its defaults in a Models section; the values here override those defaults. Delete a line to fall back to the skill default. A value of `inherit-parent` or `auto` runs that role on the parent session's model (the `Agent` call omits `model`); an alias entry in a panel list still counts toward that panel's fan-out. A model may carry a reasoning effort, as in `opus @xhigh` (levels: low, medium, high, xhigh, max); the role then runs through the pstack effort agent of that level, each entry of a panel list on its own. `default effort` sets the level for a value without one; `session` keeps the parent session's effort.

Do not use `fable`. Every role that defaults to `fable` runs on Opus 5.5 at high effort (`opus @high`).

feature, refactoring: opus
bug-fix: opus @high
perf-issue: opus @high
hillclimb: opus @high
judgment and prose: opus
strongest judgment: opus @high
how explorer: opus
how explainer: opus
why investigators: opus
why synthesizer: opus
reflect tooling: opus
reflect judgment, divergent, synthesizer: opus
arena runners: opus, opus @high, sonnet
arena cross-judge pool: opus, opus @high, sonnet
swarm workers: opus
architect runners: opus, opus @high, sonnet
interrogate reviewers: opus, opus @high, sonnet

default effort: session
