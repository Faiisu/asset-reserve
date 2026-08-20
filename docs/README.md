# Asset Reservation — Documentation

This is the single source of truth for the Asset Reservation system.

## Ownership split

| Spec | Owns | Does not contain |
| --- | --- | --- |
| [`software_spec/`](software_spec/README.md) | **What** the system must do: business rules, lifecycle/state machines, permission/RBAC model, scope, acceptance criteria | API request/response shapes, UI layout, code |
| [`backend_spec/`](backend_spec/README.md) | **How** to build the API: architecture, algorithms, database/concurrency, the OpenAPI contract, deployment, backend testing strategy, backend conventions | Business-rule rationale, UI design |
| [`frontend_spec/`](frontend_spec/README.md) | **How it looks and behaves**: screens, components, visual system, interaction, accessibility, frontend data-fetching conventions | Business rules, API contracts, DTO shapes |
| [`status/`](status/implementation-status.md) | Dated as-built snapshot — what is actually implemented right now | Nothing normative — never cited as a spec |

## Cross-reference convention

**When a fact is already documented elsewhere, link to it — never restate it.**

Use the form `[label](relative/path.md#anchor)`. For example: "status enum: see [software_spec/lifecycle-and-state-machines.md#reservation-status](software_spec/lifecycle-and-state-machines.md#reservation-status)".

Rule of ownership:

- `software_spec` owns *what* — rules, lifecycle, permissions, scope. Any status enum, permission matrix, or business rule is defined exactly once here.
- `backend_spec` owns *how* — implementation, algorithms, deployment. `backend_spec/contracts/openapi.yaml` is the **sole** source of request/response shapes; no other file (in any spec) may hand-write a JSON request/response body.
- `frontend_spec` owns *how it looks and behaves visually* — screens, components, interaction, accessibility. It links to `software_spec` for business rules and to `backend_spec/contracts` for data shapes instead of restating either.

A restated status enum, permission list, or JSON body in a new or edited doc is a reviewable defect — replace it with a link during review.

## Reading order for someone new to the system

1. [`software_spec/README.md`](software_spec/README.md) — what the system does
2. [`backend_spec/README.md`](backend_spec/README.md) — how the API is built
3. [`frontend_spec/README.md`](frontend_spec/README.md) — how the UI is designed
4. [`status/implementation-status.md`](status/implementation-status.md) — what's actually shipped today
