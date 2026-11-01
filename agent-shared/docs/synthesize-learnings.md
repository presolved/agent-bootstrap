# Synthesize Learnings

A portable workflow for reviewing completed work and capturing reusable knowledge into the shared wiki at `~/.agent-shared/wiki/`. Run this at the end of any non-trivial session.

## When to run

- After completing a feature, bug fix, or investigation that produced non-obvious insights
- When the user asks to update the KB or capture learnings
- Before closing a session where you discovered gotchas, new workflows, or architectural patterns

## Workflow

### 1. Load wiki context

- Read `~/.agent-shared/wiki/SCHEMA.md` for structure, templates, and conventions.
- Read `~/.agent-shared/wiki/index.md` to know what's already captured. On a fresh machine it does not exist yet; create it (and `log.md`) as SCHEMA.md describes.

### 2. Identify candidate learnings

Review the session's work and look for knowledge that is:

- **Reusable across sessions** — patterns, gotchas, workflows, or architectural insights (not just "what we did")
- **Not already in the wiki** — check the index for existing coverage
- **Not derivable from code** — skip things you can read from source files or git history

Categories to consider:
- New workflows or runbooks → guide pages
- Architectural patterns or decisions → concept or project pages
- Tool/service gotchas or non-obvious behaviors → entity pages
- Answers to questions that took significant investigation → answer pages

### 3. Present candidates to the user

For each candidate, briefly state:
- **What**: the knowledge (1-2 sentences)
- **Where**: existing page to update, or new page to create
- **Why**: what future scenario benefits from having this

Ask the user which to proceed with. Do not write without confirmation.

### 4. Write or update wiki pages

For each approved candidate:

**Updating an existing page:**
- Read the current page
- Make targeted edits (add sections, update content, refine)
- Set `updated:` to today's date

**Creating a new page:**
- Use the appropriate template from SCHEMA.md
- Place in the correct subdirectory under `pages/`
- Include `[[wikilinks]]` to related existing pages

**Update the index:**
- Add new pages to the appropriate topic cluster in `~/.agent-shared/wiki/index.md`
- Write a one-line summary that serves as a retrieval hint
- Create a new cluster if needed

**Append to the log:**
```
## YYYY-MM-DD HH:MM — update

- **Agent**: <agent-name>
- **Operation**: create | update
- **Pages affected**: [[page1]], [[page2]]
- **Summary**: One-line description
```

### 5. Verify

- Confirm all wikilinks resolve to real files
- Confirm index entries match actual page paths
- Report what was written or updated
