-- Expand ReservationItemUnit into a time-aware assignment. The copied range
-- lets PostgreSQL enforce overlap without joining through ReservationItem.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

ALTER TABLE "reservation_item_units"
  ADD COLUMN "assignment_start_at" TIMESTAMPTZ(6),
  ADD COLUMN "assignment_end_at" TIMESTAMPTZ(6);

UPDATE "reservation_item_units" AS riu
SET
  "assignment_start_at" = r."start_at",
  "assignment_end_at" = r."end_at"
FROM "reservation_items" AS ri
JOIN "reservations" AS r ON r."id" = ri."reservation_id"
WHERE ri."id" = riu."reservation_item_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "reservation_item_units"
    WHERE "assignment_start_at" IS NULL OR "assignment_end_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill one or more reservation item assignment windows';
  END IF;
END $$;

ALTER TABLE "reservation_item_units"
  ALTER COLUMN "assignment_start_at" SET NOT NULL,
  ALTER COLUMN "assignment_end_at" SET NOT NULL;

ALTER TABLE "reservation_item_units"
  ADD CONSTRAINT "reservation_item_units_assignment_window_check"
  CHECK ("assignment_end_at" > "assignment_start_at") NOT VALID;
ALTER TABLE "reservation_item_units"
  VALIDATE CONSTRAINT "reservation_item_units_assignment_window_check";

-- Compatibility window: an older backend can still omit the new columns.
-- The trigger derives them from the owning reservation before NOT NULL checks.
CREATE FUNCTION "fill_reservation_item_unit_assignment_window"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."assignment_start_at" IS NULL OR NEW."assignment_end_at" IS NULL THEN
    SELECT r."start_at", r."end_at"
    INTO NEW."assignment_start_at", NEW."assignment_end_at"
    FROM "reservation_items" AS ri
    JOIN "reservations" AS r ON r."id" = ri."reservation_id"
    WHERE ri."id" = NEW."reservation_item_id";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reservation_item_units_fill_assignment_window"
BEFORE INSERT OR UPDATE OF "reservation_item_id" ON "reservation_item_units"
FOR EACH ROW
EXECUTE FUNCTION "fill_reservation_item_unit_assignment_window"();

-- Keep denormalized assignment windows correct if a reservation schedule is
-- changed through an administrative/database path. A newly introduced
-- overlap aborts the schedule update atomically through the EXCLUDE guard.
CREATE FUNCTION "sync_reservation_item_unit_assignment_windows"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "reservation_item_units" AS riu
  SET
    "assignment_start_at" = NEW."start_at",
    "assignment_end_at" = NEW."end_at"
  FROM "reservation_items" AS ri
  WHERE ri."id" = riu."reservation_item_id"
    AND ri."reservation_id" = NEW."id";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reservations_sync_assignment_windows"
AFTER UPDATE OF "start_at", "end_at" ON "reservations"
FOR EACH ROW
WHEN (OLD."start_at" IS DISTINCT FROM NEW."start_at" OR OLD."end_at" IS DISTINCT FROM NEW."end_at")
EXECUTE FUNCTION "sync_reservation_item_unit_assignment_windows"();

DROP INDEX IF EXISTS "reservation_item_units_active_unit_key";

ALTER TABLE "reservation_item_units"
  ADD CONSTRAINT "reservation_item_units_no_overlapping_assignments"
  EXCLUDE USING GIST (
    "asset_unit_id" WITH =,
    tstzrange("assignment_start_at", "assignment_end_at", '[)') WITH &&
  )
  WHERE ("status" IN ('ASSIGNED', 'CHECKED_OUT'));

CREATE INDEX "reservation_item_units_asset_unit_status_window_idx"
  ON "reservation_item_units"(
    "asset_unit_id",
    "status",
    "assignment_start_at",
    "assignment_end_at"
  );

-- RESERVED represented a future schedule lock in the old model. Scheduling
-- now lives on ReservationItemUnit, so normalize those physical units without
-- deleting their assignment or event history.
UPDATE "asset_units"
SET "status" = 'ACTIVE', "updated_at" = NOW()
WHERE "status" = 'RESERVED';

-- Rollback path (manual, before deploying the old application):
-- 1. Verify no asset_unit_id has more than one ASSIGNED/CHECKED_OUT row. Once
--    non-overlapping multi-booking is used, drain/cancel later assignments;
--    the old global-unique model cannot represent them losslessly.
-- 2. Set ACTIVE units with an ASSIGNED row back to RESERVED.
-- 3. Drop the two triggers/functions, EXCLUDE constraint, window CHECK/index,
--    and range columns.
-- 4. Recreate reservation_item_units_active_unit_key from migration
--    20260818200000_serialized_asset_units.
