-- DropForeignKey
ALTER TABLE "asset_transaction_batches" DROP CONSTRAINT "asset_transaction_batches_performed_by_fkey";

-- DropForeignKey
ALTER TABLE "asset_transactions" DROP CONSTRAINT "asset_transactions_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "asset_transactions" DROP CONSTRAINT "asset_transactions_batch_id_fkey";

-- DropIndex
DROP INDEX "reservation_change_requests_one_pending";

-- AlterTable
ALTER TABLE "assets" DROP COLUMN "status",
DROP COLUMN "total_quantity",
ADD COLUMN     "part_number" VARCHAR(100);

-- AlterTable
ALTER TABLE "return_items" DROP COLUMN "quantity_broken",
DROP COLUMN "quantity_lost",
DROP COLUMN "quantity_returned";

-- DropTable
DROP TABLE "asset_transaction_batches";

-- DropTable
DROP TABLE "asset_transactions";

-- CreateTable
CREATE TABLE "asset_units" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "serial_number" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_unit_event_batches" (
    "id" UUID NOT NULL,
    "description" TEXT,
    "performed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_unit_event_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_unit_events" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "asset_unit_id" UUID NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "from_status" VARCHAR(20),
    "to_status" VARCHAR(20),
    "reservation_item_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_unit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_item_units" (
    "id" UUID NOT NULL,
    "reservation_item_id" UUID NOT NULL,
    "asset_unit_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),

    CONSTRAINT "reservation_item_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_item_units" (
    "id" UUID NOT NULL,
    "return_item_id" UUID NOT NULL,
    "reservation_item_unit_id" UUID NOT NULL,
    "condition" VARCHAR(10) NOT NULL,
    "photo_url" VARCHAR(1000),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_item_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_units_asset_id_status_idx" ON "asset_units"("asset_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_units_serial_number_key" ON "asset_units"("serial_number");

-- CreateIndex
CREATE INDEX "asset_unit_event_batches_performed_by_idx" ON "asset_unit_event_batches"("performed_by");

-- CreateIndex
CREATE INDEX "asset_unit_events_asset_unit_id_created_at_idx" ON "asset_unit_events"("asset_unit_id", "created_at");

-- CreateIndex
CREATE INDEX "asset_unit_events_batch_id_idx" ON "asset_unit_events"("batch_id");

-- CreateIndex
CREATE INDEX "asset_unit_events_reservation_item_id_idx" ON "asset_unit_events"("reservation_item_id");

-- CreateIndex
CREATE INDEX "reservation_item_units_asset_unit_id_idx" ON "reservation_item_units"("asset_unit_id");

-- CreateIndex
CREATE INDEX "reservation_item_units_reservation_item_id_status_idx" ON "reservation_item_units"("reservation_item_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_item_units_reservation_item_id_asset_unit_id_key" ON "reservation_item_units"("reservation_item_id", "asset_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_item_units_reservation_item_unit_id_key" ON "return_item_units"("reservation_item_unit_id");

-- CreateIndex
CREATE INDEX "return_item_units_return_item_id_idx" ON "return_item_units"("return_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_change_requests_one_pending" ON "reservation_change_requests"("reservation_id") WHERE ("status" = 'PENDING');

-- AddForeignKey
ALTER TABLE "asset_units" ADD CONSTRAINT "asset_units_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_unit_event_batches" ADD CONSTRAINT "asset_unit_event_batches_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_unit_events" ADD CONSTRAINT "asset_unit_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "asset_unit_event_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_unit_events" ADD CONSTRAINT "asset_unit_events_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_unit_events" ADD CONSTRAINT "asset_unit_events_reservation_item_id_fkey" FOREIGN KEY ("reservation_item_id") REFERENCES "reservation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item_units" ADD CONSTRAINT "reservation_item_units_reservation_item_id_fkey" FOREIGN KEY ("reservation_item_id") REFERENCES "reservation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item_units" ADD CONSTRAINT "reservation_item_units_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item_units" ADD CONSTRAINT "reservation_item_units_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_item_units" ADD CONSTRAINT "return_item_units_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_item_units" ADD CONSTRAINT "return_item_units_reservation_item_unit_id_fkey" FOREIGN KEY ("reservation_item_unit_id") REFERENCES "reservation_item_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual additions: partial unique indexes and status/condition CHECK constraints
-- that Prisma schema language cannot express.

-- A part number is only required to be unique per management area when present.
CREATE UNIQUE INDEX "assets_area_part_number_key" ON "assets"("management_area_id", "part_number") WHERE "part_number" IS NOT NULL;

-- A physical asset unit can only be actively assigned (ASSIGNED/CHECKED_OUT) to one
-- reservation item at a time -- the DB-level guard against double-booking a serial.
CREATE UNIQUE INDEX "reservation_item_units_active_unit_key" ON "reservation_item_units"("asset_unit_id") WHERE "status" IN ('ASSIGNED', 'CHECKED_OUT');

ALTER TABLE "asset_units" ADD CONSTRAINT "asset_units_status_check"
  CHECK ("status" IN ('ACTIVE', 'RESERVED', 'CHECKED_OUT', 'BROKEN', 'LOST', 'IN_REPAIR', 'INACTIVE'));

ALTER TABLE "asset_unit_events" ADD CONSTRAINT "asset_unit_events_event_type_check"
  CHECK ("event_type" IN ('REGISTERED', 'RETIRED', 'REACTIVATED', 'RESERVED', 'CHECKED_OUT', 'RETURNED_GOOD', 'RETURNED_BROKEN', 'RETURNED_LOST', 'REPAIRED', 'ADJUSTMENT'));

ALTER TABLE "reservation_item_units" ADD CONSTRAINT "reservation_item_units_status_check"
  CHECK ("status" IN ('ASSIGNED', 'CHECKED_OUT', 'RETURNED_GOOD', 'RETURNED_BROKEN', 'RETURNED_LOST'));

ALTER TABLE "return_item_units" ADD CONSTRAINT "return_item_units_condition_check"
  CHECK ("condition" IN ('GOOD', 'BROKEN', 'LOST'));

