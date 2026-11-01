# Cloud agent: one work item

You are a Cursor cloud agent that an orchestrator started for **one item of
work**. The brief in your prompt is the whole scope. Other agents work other
items at the same time, each on its own machine and branch, and the
orchestrator merges the results. This page is your contract.

The repo has its own cloud-agent notes. Your prompt names them; if it does
not, the repo's `AGENTS.md` links them. Read them before you start. They say how
this repo prepares the machine, checks a change, and verifies it in the app. The
repo's own `AGENTS.md` (and `CLAUDE.md` or constitution, when present) apply to
everything you write and win over this page where they conflict.

## Your machine

The machine is yours alone: its database and app are not shared with another
agent. Only the real external services the notes name are shared. Before your
first check, run the start step the notes name, even if the environment already
ran it; it is safe to repeat.

## Rules

1. **Stay in scope.** Do what the brief asks and nothing else. If you find a
   problem outside it, put it under `FOLLOW-UPS` in your report.
2. **Your branch only.** Work on the branch Cursor gave you. Do not create other
   branches. Never merge, rebase onto anything except the ref the orchestrator
   names, push to the default branch, deploy, or open a PR unless the brief says
   to.
3. **No questions mid-run.** Nobody reads them. When a product decision blocks
   you, stop and report `NEEDS_DECISION` with the options and your
   recommendation. When a decision is reversible and the brief leans one way,
   take it and record it under `DECISIONS`.
4. **Secrets stay put.** Never print, log, or commit secrets, session cookies,
   or browser state files.

## Workflow

1. **Read** the brief, the repo's notes, then the code the brief touches.
2. **Implement** with tests, following the repo's own instructions.
3. **Check** with the commands the notes name, and fix what fails.
4. **Verify in the app** the way the notes describe: prove the change the way a
   user sees it, and say which mode you used.
5. **Commit and push** your branch, in the repo's commit style.
6. **Report** (below), as the last thing in your final message.

When you create anything on a real external service, name it
`agent-<your branch's last segment>-…` and delete it before you report, unless
the brief says to keep it.

## Report

End your final message with this block, exactly these headings, nothing after
it. The orchestrator parses it.

```text
STATUS: READY | BLOCKED | NEEDS_DECISION
BRANCH: <branch>
COMMITS:
- <sha> <subject>
CHANGED: <one line per user-visible change>
VERIFIED: <mode, what you drove, evidence paths>
CHECKS: <command and verdict per check>
NOT VERIFIED: <anything you could not prove, or none>
DECISIONS: <reversible calls you made, or none>
QUESTIONS: <for NEEDS_DECISION: options and your recommendation; else none>
FOLLOW-UPS: <out-of-scope findings, or none>
```

`READY` means the checks passed and you verified the change. `BLOCKED` means you
could not finish for a reason the orchestrator must fix (environment, access, a
broken base). Give the exact error.

## Follow-ups

The orchestrator may send review fixes, or ask you to merge a newer integration
ref, in a later run. Treat each as a new brief on the same branch: apply it,
repeat the check, verify, push, and report steps, and send a new report block.
