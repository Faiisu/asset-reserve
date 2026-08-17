# 📘 Reservation Status Reference

This document defines the **canonical set of reservation statuses** used throughout the Asset Reservation System after the removal of the `ACTIVE` status.

| Status Key            | Description                               | UI Label (Badge) | Typical Next Transitions |
|-----------------------|-------------------------------------------|------------------|--------------------------|
| `DRAFT`               | Reservation is being drafted.            | Draft (Gray)     | `PENDING_APPROVAL`, `CANCELLED` |
| `PENDING_APPROVAL`    | Awaiting area‑manager approvals.          | Pending (Amber)  | `APPROVED`, `PARTIALLY_APPROVED`, `REJECTED`, `CANCELLED` |
| `PARTIALLY_APPROVED` | Some items approved, others rejected.    | Partially Approved (Violet) | `DELIVERY_CONFIRMED`, `CANCELLED` |
| `APPROVED`            | All items approved; ready for hand‑over.  | Approved (Green) | `DELIVERY_CONFIRMED`, `CANCELLED` |
| `DELIVERY_CONFIRMED`  | Equipment handed over to the requester.   | Delivery Confirmed (Cyan) | `RETURN_PENDING`, `COMPLETED` |
| `RETURN_PENDING` / `RETURN` | Return slip submitted; awaiting inspection. | Return Pending (Orange) | `RETURN_CONFIRMED`, `COMPLETED` |
| `RETURN_CONFIRMED`    | Return inspected and accepted.            | Partially Return (Emerald) | `COMPLETED`, `DELIVERY_CONFIRMED` (if partial return) |
| `COMPLETED`           | All items fully returned & restocked.     | Return Completed (Slate/Green) | – (final) |
| `REJECTED`            | All items rejected by area managers.      | Rejected (Red)   | – (final) |
| `CANCELLED`           | Reservation cancelled before pickup.      | Cancelled (Zinc) | – (final) |

### Return Eligibility Rule

An asset can be returned **at any time after the reservation’s `endAt` timestamp** has passed, regardless of the reservation’s current status. This rule replaces the previously used `ACTIVE` status.

> **Implementation Note:** Frontend capability `canReturn` now evaluates the condition `(new Date() >= new Date(reservation.endAt))` in addition to the traditional status checks.

---

### Cross-User Visibility Rule

Access to other users' reservations is gated behind the **`reservation:view`** permission.

| Permission | Scope | Behavior |
|---|---|---|
| `reservation:view` (global) | System-wide | Can browse and view all reservations |
| `reservation:view` (area-scoped) | Per management area | Can browse and view reservations containing items from that area |
| *(none)* | — | Can only see own reservations (as requester or participant) |

> **Important:** Operational permissions (`reservation:approve`, `reservation:reject`, `reservation:update`) do **not** grant cross-user view access on their own. Assign `reservation:view` to any role that requires browsing other users' reservations.

**Backend enforcement:**
- `GET /reservations?view=ALL` — applies `reservation:view` scope filter
- `GET /reservations/:id` — requires `reservation:view` (or operational access) for non-participants on non-private statuses

### 🛡️ Past Date & Time Protection Rule

1. **Reservation Creation & Changes:**
   - Reservations cannot be created or rescheduled into the past.
   - `startAt` must be in the future relative to the current timestamp (`startAt >= now`, allowing a standard 60-second clock skew/network grace window).
   - If `startAt < now - 60s`, the backend API throws `422 VALIDATION_ERROR` with message `"The reservation start time cannot be in the past."`.
   - `endAt` must always be strictly later than `startAt` (`endAt > startAt`).

2. **Frontend UI Enforcement:**
   - **Calendar View (`CalendarPage`)**: Past dates before today are styled with `.calendar-day--past`. Attempting to start a range on a past date is guarded, and the reserve action is disabled if the selected schedule starts in the past.
   - **Reservation Form (`ReservationCreatePage`)**: `datetime-local` inputs enforce `min` constraints set to the current local date/time, and client-side validation prevents submitting past schedules.

---

*Document version:* 2.2.0  
*Last updated:* 2026‑08‑17
