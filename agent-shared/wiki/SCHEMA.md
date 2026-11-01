# Wiki Schema

This document defines the structure, conventions, and workflows for the LLM Wiki at `~/.agent-shared/wiki/`. Any LLM agent that reads this file has everything it needs to read from, write to, and maintain this wiki.

## Purpose

A persistent, incrementally built knowledge base covering general programming knowledge and project-specific knowledge. The wiki is maintained by LLM agents and designed to be useful across sessions and across different agents.

## Always-on retrieval

The wiki is not a side feature — it is the agent's primary knowledge layer. At the start of every task:

1. **Read `index.md`** — scan the topic clusters for anything relevant to the current task
2. **Read relevant pages** — drill into pages that match the task context
3. **Work with that knowledge loaded** — let it inform decisions, avoid re-discovering known patterns

After completing work:

4. **Capture new knowledge** — if the task produced reusable insights, create or update wiki pages
5. **Improve the index** — if you noticed the index didn't surface something it should have, or a cluster name was misleading, refine it

This loop is how the wiki compounds. Every task is an opportunity to both *use* and *improve* the knowledge base.

## Directory layout

```
~/.agent-shared/wiki/
├── SCHEMA.md      # This file
├── index.md       # Content catalog with links and one-line summaries
├── log.md         # Chronological append-only operation log
├── raw/           # Immutable source documents (never edited after creation)
│   └── assets/    # Downloaded images and attachments
└── pages/         # LLM-generated pages (subfolders created as needed)
```

Subfolders under `pages/` are created organically as pages are added. Common categories include `concepts/`, `entities/`, `projects/`, `comparisons/`, `guides/`, `answers/`, `development/` — but any subfolder is fine. Create what makes sense.

## File naming

- All files use kebab-case: `error-handling-patterns.md`, `effect-ts.md`
- Raw files are date-prefixed: `YYYY-MM-DD-slug.md`
- Page files are not date-prefixed (they evolve over time)
- Use descriptive slugs. Prefer `react-server-components.md` over `rsc.md`

## Frontmatter

Every page under `pages/` uses YAML frontmatter. Raw files, SCHEMA.md, index.md, and log.md do not.

### Required fields

```yaml
---
title: "Human-readable page title"
type: concept | entity | project | comparison | guide | answer | development
tags: [tag1, tag2, tag3]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []  # [[raw/filename]] wikilinks or external URLs
---
```

### Additional fields by type

**entity** pages add:
```yaml
category: language | framework | library | tool | service | platform
```

**comparison** pages add:
```yaml
subjects: ["Thing A", "Thing B"]
```

**project** pages add:
```yaml
project: project-name
```

**answer** pages add:
```yaml
question: "The original question that prompted this page"
```

## Cross-referencing

Use Obsidian-style wikilinks for internal references:

- `[[page-name]]` links to `pages/**/page-name.md` (resolve by searching for matching filename)
- `[[raw/2026-04-04-some-article]]` links to a raw source
- `[[page-name|display text]]` for aliased links

Do not use relative file paths for cross-references. Wikilinks are agent-agnostic and human-readable.

**Resolution algorithm**: To resolve `[[page-name]]`, glob for `pages/**/page-name.md`. If no match, check `raw/**/page-name.md`. Filenames must be unique across the wiki.

## Tagging conventions

Use lowercase, hyphenated tags. Prefer existing tags over new ones.

- **Domain**: `typescript`, `react`, `node`, `effect-ts`, `testing`, `devops`, `css`
- **Concern**: `error-handling`, `performance`, `security`, `architecture`, `state-management`
- **Meta**: `stale`, `needs-review`, `stub`

## Page templates

### Concept page (`pages/concepts/`)

```markdown
---
title: "Concept Name"
type: concept
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

# Concept Name

One-paragraph summary.

## Core idea

Explain the concept clearly and concisely.

## When to use

Situations where this concept applies.

## When to avoid

Situations where this concept is a poor fit.

## Examples

Concrete examples, optionally with code.

## Related

- [[related-pages]]
```

### Entity page (`pages/entities/`)

```markdown
---
title: "Entity Name"
type: entity
category: library
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

# Entity Name

One-paragraph summary.

## Key characteristics

Bullet list of defining traits.

## Common patterns

How this entity is typically used.

## Gotchas

Non-obvious pitfalls or surprises.

## Related

- [[related-pages]]
```

### Comparison page (`pages/comparisons/`)

```markdown
---
title: "A vs B"
type: comparison
subjects: ["A", "B"]
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

# A vs B

One-paragraph framing.

## Summary table

| Dimension | A | B |
|-----------|---|---|
| ... | ... | ... |

## When to choose A

## When to choose B

## Related

- [[related-pages]]
```

### Guide page (`pages/guides/`)

```markdown
---
title: "How to Do X"
type: guide
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

# How to Do X

One-paragraph summary.

## Prerequisites

## Steps

### 1. First step

### 2. Second step

## Troubleshooting

## Related

- [[related-pages]]
```

### Answer page (`pages/answers/`)

```markdown
---
title: "Descriptive title"
type: answer
question: "The original question"
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

# Descriptive title

## Question

The original question, stated clearly.

## Answer

The synthesized answer.

## Sources and reasoning

How the answer was derived and from what.

## Related

- [[related-pages]]
```

### Project page (`pages/projects/`)

```markdown
---
title: "Project: Specific Topic"
type: project
project: project-name
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

# Project: Specific Topic

## Context

Why this matters for the project.

## Details

The knowledge itself.

## Related

- [[related-pages]]
```

### Development page (`pages/development/`)

```markdown
---
title: "Development Topic"
type: development
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

# Development Topic

## Overview

What this covers and why it matters.

## Details

The workflow, setup, or tooling knowledge.

## Related

- [[related-pages]]
```

## Raw source format

Raw files are immutable after creation. They use a simple header, not the wiki frontmatter schema:

```markdown
# Source title

- **URL**: (if applicable)
- **Author**: (if known)
- **Date**: (publication date if known)
- **Ingested**: YYYY-MM-DD

---

(Full or excerpted content below)
```

## index.md format

The index is a **concept map**, not a flat catalog. It is organized by **topic clusters** — high-level domains that map to the kinds of tasks the user works on. Each cluster lists related pages regardless of type (concepts, entities, guides, etc. all intermixed). This lets agents scan the index, pattern-match against the current task, and know exactly which pages to load.

```markdown
# Wiki Index

Last updated: YYYY-MM-DD

## Error Handling
- [[effect-ts-error-model]] — Typed error channels in Effect pipelines
- [[error-handling-patterns]] — Guard clauses, Result types, discriminated unions

## Testing
- [[e2e-testing-patterns]] — Playwright patterns, observable waits
- [[integration-vs-unit]] — When to use real DB vs mocks

## [Topic Cluster Name]
- [[page-name]] — One-line summary that helps an agent decide whether to read the page
```

### Index maintenance rules

- **Cluster by concept, not by page type.** A comparison page and a concept page about the same domain belong in the same cluster.
- **Summaries are retrieval hints.** Write them so an agent can decide relevance without opening the page. Include key terms the agent might be looking for.
- **A page can appear in multiple clusters** if it spans topics.
- **Continuously refine clusters.** If a cluster grows past ~15 entries, split it. If two clusters always get consulted together, merge them. Rename clusters when better names emerge. The index should get *better at surfacing relevant pages* over time.
- **Keep a `## Raw Sources` section** at the bottom for unprocessed sources that haven't been fully integrated yet.
- **Keep an `## Uncategorized` section** at the bottom as a temporary holding area. During lint, move uncategorized pages into proper clusters.

## log.md format

Append-only. Each entry is a self-contained block. Append to the end of the file.

```markdown
## YYYY-MM-DD HH:MM — operation-type

- **Agent**: agent-name (e.g., claude-code, codex, opencode)
- **Operation**: ingest | create | update | delete | query | lint
- **Pages affected**: [[page1]], [[page2]]
- **Summary**: One-line description of what was done
```

## Operations

### Ingest

When the user provides a new source document (article, paper, snippet, URL content):

1. Save the source content to `raw/YYYY-MM-DD-slug.md`
2. Create or update relevant pages:
   - If the source is about a known entity, update that entity page
   - If the source introduces a new concept, create a concept page
   - If the source compares things, consider a comparison page
   - Create subfolders under `pages/` as needed
3. Add cross-references (`[[wikilinks]]`) to related existing pages
4. Update `index.md` with any new pages
5. Append to `log.md`

### Query

When the user asks a question and the wiki may help:

1. Read `index.md` for relevant pages
2. Read relevant pages
3. Synthesize an answer
4. If the answer is substantial and reusable, offer to save it as a page under `pages/answers/`
5. If answering revealed gaps, note them for future ingestion
6. Append to `log.md`

### Lint

Periodic health check. Run when explicitly requested:

1. Check for orphan pages (not in index.md)
2. Check for broken wikilinks (links to pages that do not exist)
3. Check for pages missing required frontmatter fields
4. Check for stale pages (not updated in a long time, tag with `stale`)
5. Check for duplicate or near-duplicate pages
6. Check for missing cross-references between obviously related pages
7. **Improve retrieval quality:**
   - Move pages from `## Uncategorized` into proper topic clusters
   - Split clusters that have grown past ~15 entries
   - Merge clusters that are always consulted together
   - Rewrite summaries that are too vague to be useful as retrieval hints
   - Add missing key terms to summaries so future searches hit them
   - Check if any page should appear in additional clusters
8. Report findings and optionally fix them
9. Append to `log.md`

## Conventions

- Keep pages focused. One concept, one entity, one comparison per page.
- Prefer updating existing pages over creating new ones when the topic overlaps.
- Always check the index before creating a new page to avoid duplicates.
- When updating a page, update the `updated` frontmatter field.
- Use the `stub` tag for pages that need more content.
- Write for a knowledgeable developer audience. Be concise.
- Code examples should be self-contained and runnable where possible.
- Do not store secrets, credentials, or personally identifying information.
