-- Remove lifecycle values that no current write path persists. Abort instead
-- of rewriting historical data if a deployment still contains legacy rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "reservations"
    WHERE "status" IN ('PENDING', 'ACTIVE', 'RETURN', 'RETURN_CONFIRMED')
  ) THEN
    RAISE EXCEPTION 'Cannot remove legacy reservation statuses while rows still use them'
      USING HINT = 'Migrate the affected reservation rows to canonical statuses, then retry.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "reservation_items"
    WHERE "status" IN ('APPROVED', 'CHECKED_OUT')
  ) THEN
    RAISE EXCEPTION 'Cannot remove legacy reservation item statuses while rows still use them'
      USING HINT = 'Migrate the affected item rows to PREPARED or DELIVERED, then retry.';
  END IF;

  IF EXISTS (SELECT 1 FROM "returns" WHERE "status" = 'APPROVED') THEN
    RAISE EXCEPTION 'Cannot remove the legacy APPROVED return status while rows still use it'
      USING HINT = 'Move completed inspections to COMPLETED, then retry.';
  END IF;
END $$;

ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "reservations_status_check";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_status_check"
  CHECK ("status" IN (
    'DRAFT', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED',
    'DELIVERY_CONFIRMED', 'RETURN_PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'
  )) NOT VALID;
ALTER TABLE "reservations" VALIDATE CONSTRAINT "reservations_status_check";

ALTER TABLE "reservation_items" DROP CONSTRAINT IF EXISTS "reservation_items_status_check";
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_status_check"
  CHECK ("status" IN ('PENDING', 'REJECTED', 'PREPARED', 'DELIVERED', 'RETURNED')) NOT VALID;
ALTER TABLE "reservation_items" VALIDATE CONSTRAINT "reservation_items_status_check";

ALTER TABLE "returns" DROP CONSTRAINT IF EXISTS "returns_status_check";
ALTER TABLE "returns" ADD CONSTRAINT "returns_status_check"
  CHECK ("status" IN ('PENDING', 'REJECTED', 'COMPLETED')) NOT VALID;
ALTER TABLE "returns" VALIDATE CONSTRAINT "returns_status_check";

-- Rollback: restore the three previous CHECK definitions from
-- 20260816233000_update_status_check_constraints. No row data is changed here.
