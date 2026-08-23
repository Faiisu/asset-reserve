-- Handover now requires a disposition for every assigned serial: hand it over,
-- or cancel it (§7.8). Cancelling introduces CANCELLED on both
-- reservation_item_units (the serial never left the store room) and
-- reservation_items (every one of its serials was cancelled).
--
-- CANCELLED deliberately sits outside
-- "reservation_item_units_no_overlapping_assignments", whose WHERE clause
-- covers only ASSIGNED/CHECKED_OUT, so cancelling frees the serial's window
-- immediately with no further change.

ALTER TABLE "reservation_item_units" DROP CONSTRAINT IF EXISTS "reservation_item_units_status_check";
ALTER TABLE "reservation_item_units" ADD CONSTRAINT "reservation_item_units_status_check"
  CHECK ("status" IN (
    'ASSIGNED', 'CANCELLED', 'CHECKED_OUT',
    'RETURNED_GOOD', 'RETURNED_BROKEN', 'RETURNED_LOST'
  )) NOT VALID;
ALTER TABLE "reservation_item_units" VALIDATE CONSTRAINT "reservation_item_units_status_check";

ALTER TABLE "reservation_items" DROP CONSTRAINT IF EXISTS "reservation_items_status_check";
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_status_check"
  CHECK ("status" IN (
    'PENDING', 'REJECTED', 'PREPARED', 'DELIVERED', 'RETURNED', 'CANCELLED'
  )) NOT VALID;
ALTER TABLE "reservation_items" VALIDATE CONSTRAINT "reservation_items_status_check";

-- Rollback: restore the two CHECK definitions from
-- 20260818200000_serialized_asset_units and 20260822170000_remove_dead_statuses
-- respectively, after resolving any row that already uses CANCELLED. Item rows
-- have no lossless pre-CANCELLED equivalent -- their serials were approved and
-- then withheld -- so those reservations must be cancelled outright first.
