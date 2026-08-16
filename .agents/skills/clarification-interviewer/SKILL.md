# Clarification & Interviewing Skill

---
name: clarification-interviewer
description: >
  Bakes a mandatory "ask-before-act" discipline into any AI agent conversation.
  Activate this skill whenever a user provides a vague, under-specified, or
  ambiguous request so the agent systematically elicits all missing information
  before writing a single line of code or producing any deliverable.
---

## Purpose

This skill prevents the agent from "guessing" and silently making wrong assumptions.
It enforces a structured interview phase between the user's initial request and the
agent's first concrete action.

---

## When to Activate

Activate this skill when **any** of the following signals are present:

- The request uses vague language: "something like", "kinda", "just make it work", "you know what I mean"
- The scope is unspecified (no target language, framework, or platform mentioned)
- Business rules or edge-cases are missing (auth, error handling, empty states, roles)
- The deliverable format is unclear (API? UI? CLI? Library?)
- The request references external systems without explaining the integration shape
- The user is describing a problem, not a solution

---

## Interview Protocol

### Phase 1 — Context Gathering (always run)

Ask the following in a **single, grouped message** (do not fire questions one-by-one):

```
Before I start, I need to clarify a few things:

1. **Goal**: What is the primary outcome this feature/change must achieve?
2. **Actors**: Who are the end-users or systems that will interact with this?
3. **Platform / Stack**: Which language, framework, runtime, or cloud provider should be used?
4. **Constraints**: Are there any hard constraints? (deadline, budget, existing codebase, compliance)
5. **Definition of Done**: How will you know this is complete? (tests pass, deployed, stakeholder sign-off?)
```

### Phase 2 — Edge-Case Probing (run if Phase 1 answers reveal gaps)

After the user answers, probe for edge cases relevant to the domain:

| Domain        | Probe Questions |
|---------------|-----------------|
| Auth / Users  | What happens on login failure? Token expiry? Role escalation? |
| Data / CRUD   | What is the max record size? Soft-delete or hard-delete? Pagination strategy? |
| APIs          | Rate limiting? Versioning? Backward compat? |
| UI / Frontend | Responsive? Accessibility (a11y) level? i18n/L10n? |
| Background Jobs | Retry policy? Idempotency? Dead-letter queue? |
| Payments      | Refunds? Chargebacks? Currency precision? |

### Phase 3 — Assumption Register

Before proceeding, present a short **Assumption Register**:

```markdown
## Assumptions I'm Making
- [ ] Assumption 1: <state assumption> — ✅ Confirm or ❌ Correct me
- [ ] Assumption 2: …
```

Get explicit sign-off (`✅ Confirmed`) before continuing.

---

## Rules the Agent MUST Follow

1. **Never write code before Phase 1 is complete** unless the request is trivially unambiguous (e.g., "fix this typo").
2. **Never make silent assumptions** — every assumption must appear in the Assumption Register.
3. **Group questions** — do not fire a single question per message; batch them.
4. **Stop at 3 rounds** — if after 3 interview rounds information is still missing, proceed with documented assumptions and flag them with `⚠️ UNVERIFIED ASSUMPTION`.
5. **Re-activate on scope creep** — if during implementation the user adds new requirements mid-task, pause and run Phase 2 again for the new scope.

---

## Output Format After Interview

Once the interview is complete, produce a **Requirement Summary Card**:

```markdown
# Requirement Summary — <Feature Name>

## Goal
<one sentence>

## Actors
- <actor 1>
- <actor 2>

## Stack
- Language: …
- Framework: …
- Infrastructure: …

## Acceptance Criteria
- [ ] AC1: …
- [ ] AC2: …

## Out of Scope
- …

## Open Questions (if any)
- …
```

Present this card to the user and wait for approval before starting work.
