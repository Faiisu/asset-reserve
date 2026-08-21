---
name: docs-recheck
description: Use whenever a change touches an algorithm, business rule, data model/schema, API contract, or UI/UX design in this repo — before writing code, and again before calling the change done. Cross-checks the change against docs/ (the single source of truth) so implementation never silently drifts from spec.
---

# Docs recheck

`docs/` is the single source of truth for this project. Any change to an
algorithm, business rule, data shape, API contract, or design/UX behavior
must be checked against it — both before implementing and after, not just
when a task happens to mention "docs."

## When this applies

Trigger this for changes to:
- Backend logic/algorithms (`backend/src/**`), especially anything affecting
  status transitions, validation rules, computed fields (e.g. quantities,
  availability), or permissions.
- Prisma schema (`backend/prisma/models/*.prisma`).
- API contracts (request/response shapes, routes, DTOs).
- Frontend page structure, component design, or UX flow
  (`frontend/src/pages/**`, `frontend/src/components/**`).

Skip it for pure refactors with no behavior/shape change, typo fixes, and
tooling/config changes unrelated to product behavior.

## Where to look

- `docs/software_spec/` — business rules, lifecycle/state machines,
  permissions. Check this for anything touching status values, transitions,
  or who-can-do-what.
- `docs/backend_spec/` — API contracts (`contracts/components/schemas/*.yaml`,
  `contracts/paths/*.yaml`, aggregated in `contracts/openapi.yaml`) and
  `algorithms-and-validation.md` for computed-field/validation logic.
- `docs/frontend_spec/` — component design principles and design system only
  (per-page specs were intentionally removed; don't expect a page-by-page
  doc to exist).
- `docs/status/implementation-status.md` — as-built snapshot, not a spec;
  useful for context but never authoritative over the spec docs above.

## Procedure

1. **Before implementing**: grep/read the relevant doc section(s) first.
   Confirm what the target behavior/shape is supposed to be — don't infer it
   from existing code alone, since code can already be drifted.
2. **If the doc and current code disagree**: stop and surface it rather than
   picking one silently. State the discrepancy and ask which one is correct
   (unless the user's request already makes the intended direction obvious,
   e.g. "update backend to match docs").
3. **After implementing**: re-read the same doc section(s) against the final
   diff. Confirm every touched field/status/rule/route still matches what
   the doc says — including anything indirectly affected (e.g. a status enum
   used in multiple places, or a contract schema referenced by multiple
   paths).
4. **If the change intentionally deviates from docs** (new correct behavior,
   docs were wrong): update the relevant doc in the same change — never leave
   docs and implementation pointing in different directions. Only edit docs
   when the user has authorized it or the discrepancy was already resolved
   in the user's direction for this change.
5. Note any other doc file that references the same concept (schema used in
   multiple contract paths, a status enum described in more than one
   software_spec section) and check those too — don't stop at the first
   match.
