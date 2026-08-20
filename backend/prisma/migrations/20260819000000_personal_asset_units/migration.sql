-- Personal ownership at the serial (asset_unit) level: SHARED units keep today's
-- management_area_id-based RBAC and are the only units counted toward company
-- reservation availability; PERSONAL units belong to a single owner, are excluded
-- from reservation pools entirely, and are managed solely by their owner (plus any
-- global-scope role).
ALTER TABLE "asset_units"
    ADD COLUMN "visibility" VARCHAR(20) NOT NULL DEFAULT 'SHARED',
    ADD COLUMN "owner_id" UUID;

CREATE INDEX "asset_units_owner_id_idx" ON "asset_units"("owner_id");

ALTER TABLE "asset_units"
    ADD CONSTRAINT "asset_units_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asset_units"
    ADD CONSTRAINT "asset_units_visibility_owner_check"
    CHECK (
        ("visibility" = 'SHARED' AND "owner_id" IS NULL) OR
        ("visibility" = 'PERSONAL' AND "owner_id" IS NOT NULL)
    );
