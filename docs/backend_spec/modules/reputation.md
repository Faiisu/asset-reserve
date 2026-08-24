# Reputation module

[← Backend specification](../README.md)

Behavior score per user (0-100, starts at 100), moved by return outcomes. Source: `backend/src/reputation/`.

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

Called once per approved return, from inside `ReturnsService.decide()`'s existing `runSerializable` transaction (same `tx` client every other write in that method uses) -- reputation changes commit atomically with the return decision itself, never as a separate write.

1. **Who's affected**: the reservation's `requesterId` and every `ReservationParticipant.userId`, deduplicated. Not just whoever physically dropped the return off (`Return.returnedBy`) -- everyone responsible for the reservation shares the outcome.
2. **Late vs. on-time**: `decidedAt` (the return-decision timestamp) compared against the *reservation's* `endAt` -- one shared due date for the whole booking, not a per-unit schedule. `RETURN_LATE` is -5, `RETURN_ON_TIME` is +5, applied once per affected user.
3. **Broken/lost**: `-5` per affected user, per unit whose decided condition (see `returns.md`) was `BROKEN` or `LOST` -- these stack with each other and with the late/on-time delta.
4. **Audit trail**: one `ReputationEvent` row per user per effect (so a return with 2 broken units and 3 affected people writes 3 late/on-time rows + 6 broken rows) -- this is what the event-history endpoints read from.
5. **Clamped update**: `User.reputation` is updated once per affected user via a single raw `UPDATE ... SET reputation = LEAST(100, GREATEST(0, reputation + $delta))` -- avoids a read-modify-write race entirely (on top of the surrounding `SERIALIZABLE` transaction already covering it).

## Implementation notes

- No new `PERMISSION_CATALOG` entry -- `@RequireGlobalAdmin()` is the same coarse admin gate `notification-settings` already uses for its own admin-only page.
- `ReturnsModule` imports `ReputationModule` (one-directional; `ReputationModule` has no dependency back on `ReturnsModule`).
- `ReputationEvent.reservationId`/`returnId` are nullable FKs purely for traceability in the admin history view -- nothing reads them to compute the score itself, the score is the running total in `User.reputation`.
