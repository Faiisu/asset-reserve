/**
 * "Hard allocation" reservation/item status sets shared by AssetsService and
 * ReservationsService — see docs/backend_spec/algorithms-and-validation.md §6.1/§7.
 * Keep this the single source of truth; two independently hand-maintained
 * copies drifted apart before (dead ACTIVE/RETURN/APPROVED/CHECKED_OUT values).
 */
export const HARD_ALLOCATION_ITEM_STATUSES = ["PREPARED", "DELIVERED"];

export const HARD_ALLOCATION_RESERVATION_STATUSES = [
  "PARTIALLY_APPROVED",
  "APPROVED",
  "DELIVERY_CONFIRMED",
  "RETURN_PENDING",
];

/** Assignment rows that still reserve a serial number's schedule window. */
export const ACTIVE_ASSIGNMENT_STATUSES = ["ASSIGNED", "CHECKED_OUT"];

/**
 * Physical states that may be considered for a future assignment. CHECKED_OUT
 * is intentionally included: its existing assignment window decides whether
 * the unit is free for the requested future range.
 * RESERVED is accepted only for compatibility with pre-window deployments.
 */
export const SCHEDULABLE_ASSET_UNIT_STATUSES = [
  "ACTIVE",
  "RESERVED",
  "CHECKED_OUT",
];
