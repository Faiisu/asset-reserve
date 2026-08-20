-- Lets a reservation item target one specific PERSONAL asset_unit directly
-- (borrowing from another user), bypassing the shared company pool. Approval
-- for such an item routes to the unit's owner instead of area RBAC.
ALTER TABLE "reservation_items"
    ADD COLUMN "requested_asset_unit_id" UUID;

CREATE INDEX "reservation_items_requested_asset_unit_id_idx"
    ON "reservation_items"("requested_asset_unit_id");

ALTER TABLE "reservation_items"
    ADD CONSTRAINT "reservation_items_requested_asset_unit_id_fkey"
    FOREIGN KEY ("requested_asset_unit_id") REFERENCES "asset_units"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_items"
    ADD CONSTRAINT "reservation_items_requested_unit_quantity_check"
    CHECK ("requested_asset_unit_id" IS NULL OR "quantity" = 1);
