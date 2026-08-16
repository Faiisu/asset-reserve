# Document Parsing & RAG Skill

---
name: document-rag
description: >
  Enables the AI agent to ingest, parse, and retrieve context from project
  documents (PRD, ADR, API specs, Confluence/Notion exports, Markdown wikis,
  PDF reports) before performing any coding or design task. Use this skill
  when the user references an existing document or when a codebase has
  supporting documentation that should inform the agent's decisions.
---

## Purpose

Ground the agent's responses in **real project context** rather than hallucinated
assumptions. By reading actual PRDs, ADRs, and specs, the agent can:

- Align new code with existing design decisions
- Detect contradictions between the user's request and documented requirements
- Avoid rewriting logic that already exists in the codebase

---

## Supported Document Types

| Format | How to Handle |
|--------|--------------|
| `.md` / `.mdx` | Read directly with `view_file` |
| `.txt` | Read directly with `view_file` |
| `.pdf` | Convert to text via `pdftotext` CLI or parse with Python `pdfminer` |
| `.json` / `.yaml` / `.toml` | Read directly; parse structure |
| Notion export (`.html` / `.md`) | Read markdown version |
| Confluence export (`.xml`) | Extract body text from `<ac:rich-text-body>` tags |
| OpenAPI / Swagger (`.yaml`/`.json`) | Parse `paths`, `components`, `schemas` |

---

## Ingestion Protocol

### Step 1 — Discover Documents

Before reading any files, scan the project root for documentation:

```bash
find . -type f \( -name "*.md" -o -name "*.pdf" -o -name "PRD*" -o -name "ADR*" \
  -o -name "*.yaml" -o -name "openapi*" -o -name "ARCHITECTURE*" \) \
  | head -40
```

Also check these canonical locations:
- `docs/`
- `wiki/`
- `.docs/`
- `README.md`
- `CONTRIBUTING.md`
- `ARCHITECTURE.md`

### Step 2 — Read & Chunk

For each relevant document:
1. Read the full file if it is under ~800 lines.
2. For longer files, read section-by-section (use heading anchors as chunk boundaries).
3. Extract and store key facts as a **Context Ledger** (see below).

### Step 3 — Build Context Ledger

After ingestion, produce a structured summary:

```markdown
## 📚 Context Ledger

### Source Documents Ingested
| File | Type | Key Sections Read |
|------|------|-------------------|
| docs/PRD.md | PRD | Goals, User Stories, Out-of-Scope |
| docs/ADR-001.md | ADR | Decision: use PostgreSQL |

### Key Domain Concepts
- <concept>: <definition from doc>

### Existing Architectural Decisions
- <decision>: <rationale>

### Constraints Extracted
- <constraint>

### Terminology / Glossary
| Term | Definition |
|------|------------|
| … | … |
```

Present this ledger to the user and confirm it reflects what they intended to share.

---

## RAG Query Protocol

When generating code or making decisions, the agent must **cross-reference** the Context Ledger:

1. Before naming a function/class → check Glossary for canonical terms.
2. Before choosing a data model → check Existing Architectural Decisions.
3. Before selecting a library → check Constraints Extracted.
4. If a decision contradicts a documented ADR → surface the conflict explicitly:

```
⚠️ Conflict Detected:
  Your request asks for MongoDB, but ADR-001 documents a decision to use PostgreSQL.
  Should I proceed with MongoDB (overriding ADR-001) or align with the existing decision?
```

---

## Rules the Agent MUST Follow

1. **Read before you write** — if a `docs/` or `wiki/` folder exists, ingest it before generating any artifact.
2. **Cite sources** — when referencing a documented decision, add an inline citation: `[ADR-001]`.
3. **Never hallucinate specs** — if a document is referenced but not found, say so and ask the user to provide it.
4. **Refresh on change** — if the user says "I updated the PRD", re-ingest before continuing.
5. **Respect out-of-scope sections** — if a feature is explicitly marked out-of-scope in the PRD, flag it before implementing.
