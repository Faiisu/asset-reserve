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
