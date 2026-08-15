-- Existing assets predate creator tracking, so the foreign key is nullable for
-- backward-compatible deployment. All API-created assets populate this column.
ALTER TABLE "assets" ADD COLUMN "created_by" UUID;

CREATE INDEX "assets_created_by_idx" ON "assets"("created_by");
CREATE INDEX "assets_management_area_id_is_active_idx"
    ON "assets"("management_area_id", "is_active");

ALTER TABLE "assets"
    ADD CONSTRAINT "assets_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep direct database writes consistent with the inventory ledger contract.
ALTER TABLE "asset_transactions"
    ADD CONSTRAINT "asset_transactions_quantity_delta_check"
    CHECK (
        ("transaction_type" IN ('ADD', 'RETURN') AND "quantity_delta" > 0) OR
        ("transaction_type" IN ('REMOVE', 'LOST', 'BROKEN') AND "quantity_delta" < 0) OR
        ("transaction_type" IN ('REPAIR', 'ADJUSTMENT') AND "quantity_delta" <> 0)
    );
