# Reputation module

[← Backend specification](../README.md)

Behavior score per user (0-100, starts at 100, DB-enforced via a `CHECK`), moved by return outcomes. Source: `backend/src/reputation/`.

## Why this module exists

A simple trust signal for borrowers: reputation drops when a return comes back late or with a broken/lost asset, and rises when a return is on time. It's read-only from the outside -- the only writer is `ReputationService.recordReturnOutcome()`, called from inside `ReturnsService.decide()` (see `returns.md`) when a return is approved, never as a standalone endpoint. There is no manual-adjustment endpoint in this version.

## Routes

5 routes under `/reputation`. Full shapes: [contracts/paths/reputation.yaml](../contracts/paths/reputation.yaml), schemas in [contracts/components/schemas/reputation.yaml](../contracts/components/schemas/reputation.yaml).

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/reputation/me` | any authenticated user | Own current score |
| GET | `/reputation/me/events` | any authenticated user | Own event history, paginated |
| GET | `/reputation` | `@RequireGlobalAdmin()` | All users' scores, paginated, searchable |
| GET | `/reputation/{userId}` | `@RequireGlobalAdmin()` | One user's current score |
| GET | `/reputation/{userId}/events` | `@RequireGlobalAdmin()` | One user's event history, paginated |

`me`/`me/events` are declared ahead of the `:userId` routes in the controller so `ParseUUIDPipe` never tries to parse `"me"` as a UUID -- same rule `users.controller.ts`'s self-service routes follow.

## How a score changes: `recordReturnOutcome`

Called once per approved return, from inside `ReturnsService.decide()`'s existing `runSerializable` transaction (same `tx` client every other write in that method uses) -- reputation changes commit atomically with the return decision itself, never as a separate write. `decide()` claims the return via an in-transaction `updateMany({ where: { id, status: "PENDING" } })` before doing anything else (see Concurrency below), so this runs at most once per return.

1. **Who's affected**: the reservation's `requesterId` and every `ReservationParticipant.userId`, deduplicated. Not just whoever physically dropped the return off (`Return.returnedBy`) -- everyone responsible for the reservation shares the outcome.
2. **Late vs. on-time**: `Return.returnedAt` (when the borrower actually submitted the return, set at drop-off in `create()`) compared against the *reservation's* `endAt` -- one shared due date for the whole booking, not a per-unit schedule. Deliberately **not** `decidedAt` (when an approver got to it) -- otherwise approval-queue latency alone could mark an on-time drop-off as late. `RETURN_LATE` is -5, `RETURN_ON_TIME` is +5, applied once per affected user.
3. **Broken/lost**: `-5` per affected user, per unit whose decided condition (see `returns.md`) was `BROKEN` or `LOST` -- these stack with each other and with the late/on-time delta.
4. **Audit trail**: one `ReputationEvent` row per user per effect (so a return with 2 broken units and 3 affected people writes 3 late/on-time rows + 6 broken rows), written in a single batched `createMany` -- this is what the event-history endpoints read from. Event deltas are the nominal per-effect amount (e.g. always -5 for a broken unit), which can differ from how much a user's score actually moved once clamping kicks in near 0 or 100 (see Known limitations).
5. **Clamped update**: `User.reputation` is updated for every affected user in one clamped atomic increment via a single raw `UPDATE ... SET reputation = LEAST(100, GREATEST(0, reputation + $delta)) WHERE id = ANY($userIds)` -- avoids both a read-modify-write race and N sequential round-trips inside the transaction.

## Concurrency: claiming the return before writing anything

`decide()`'s outer `returnRecord.status !== "PENDING"` check runs *before* the transaction starts, and `runSerializable` retries its whole closure on a Postgres serialization conflict (P2034). Before this was fixed, two overlapping `decide()` calls for the same return (a double-clicked submit, or two area managers approving at once) could both pass that outer check, and a losing transaction's retry would silently re-run every side effect a second time -- previously harmless, since the other writes in that branch (asset-unit/unit/reservation status) are idempotent (re-setting the same terminal value), but reputation deltas are not idempotent, so this would have double-penalized real users.

Fixed by claiming the row *inside* the transaction, first thing: `tx.return.updateMany({ where: { id: returnId, status: "PENDING" }, data: { updatedAt: decidedAt } })`. Only the transaction that actually flips PENDING to something else gets `count: 1` and proceeds; a second, overlapping attempt sees `count: 0` and throws `409 INVALID_STATUS`, rolling back with no partial writes. Covered by `returns.service.spec.ts`'s "aborts cleanly ... when the return was already decided by a concurrent request" test.

## Known limitations (not fixed, need a product decision)

- **Partial returns on one reservation each judge late/on-time independently against the same shared `endAt`.** This app supports multiple `Return` records per `Reservation` (partial returns; a reservation can cycle `RETURN_PENDING` → `DELIVERY_CONFIRMED` and back). Each is decided separately, and each independently compares its own `returnedAt` against the reservation's `endAt` -- so a reservation returned in 3 separate on-time drop-offs credits `+5` three times, not once per booking. Fixing this requires deciding what "once per booking" should mean when a booking has several partial returns (e.g. only score the final return? aggregate across all of a reservation's returns?) -- not guessed at here.
- **A participant added or removed between the return's initial read and the transaction's commit** is not re-verified inside the transaction (`reservation.participants` is read once, pre-transaction, alongside the rest of `returnRecord`). A narrow race window; the concurrency fix above prevents the same return being decided twice, but doesn't re-fetch participants on each retry.
- **The admin overview (`GET /reputation`) does not filter out deactivated users**, unlike `UsersService.directory()`'s participant picker. Left this way deliberately for now (an admin auditing "why did we disable this person" plausibly wants to see their history too) rather than copying an unrelated page's filter without knowing if it's the right call here -- revisit if it turns out to be noise in practice.

## Implementation notes

- No new `PERMISSION_CATALOG` entry -- `@RequireGlobalAdmin()` is the same coarse admin gate `notification-settings` already uses for its own admin-only page.
- `ReturnsModule` imports `ReputationModule` (one-directional; `ReputationModule` has no dependency back on `ReturnsModule`).
- `ReputationEvent.reservationId`/`returnId` are nullable FKs purely for traceability in the admin history view -- nothing reads them to compute the score itself, the score is the running total in `User.reputation`.
- `ReputationSummary.updatedAt` is derived from the most recent `ReputationEvent.createdAt` for that user (null if the score has never moved), not `User.updatedAt` -- the raw SQL score update never touches that column, so it would otherwise show whenever the user's profile/email was last edited instead of when their score actually changed.
- `reputation_events.type` and `users.reputation`'s 0-100 range both have database `CHECK` constraints (matching this repo's convention for status/range columns elsewhere, e.g. `asset_unit_events.event_type`, `assets_total_quantity_check`) -- not just documented in a comment.
