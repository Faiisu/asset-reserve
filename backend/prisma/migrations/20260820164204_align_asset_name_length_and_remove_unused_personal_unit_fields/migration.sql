-- Align assets.name with the documented/contract limit (varchar(40)) -- the
-- column had drifted to varchar(150), letting the backend accept longer
-- names than the published OpenAPI contract and database-schema.md promise.
ALTER TABLE "assets" ALTER COLUMN "name" SET DATA TYPE VARCHAR(40);

-- Remove the PERSONAL/SHARED asset-unit ownership fields and the
-- reservation_items.requested_asset_unit_id column added by the
-- 20260819000000_personal_asset_units and 20260819000100_reservation_item_requested_unit
-- migrations. Neither is documented anywhere (database-schema.md, the
-- OpenAPI contract, permissions-and-rbac.md, business-rules-and-validation.md)
-- and neither is referenced anywhere in backend/src -- orphaned schema from
-- an abandoned feature.
ALTER TABLE "reservation_items" DROP CONSTRAINT "reservation_items_requested_asset_unit_id_fkey";
DROP INDEX "reservation_items_requested_asset_unit_id_idx";
ALTER TABLE "reservation_items" DROP COLUMN "requested_asset_unit_id";

ALTER TABLE "asset_units" DROP CONSTRAINT "asset_units_owner_id_fkey";
DROP INDEX "asset_units_owner_id_idx";
ALTER TABLE "asset_units" DROP COLUMN "owner_id";
ALTER TABLE "asset_units" DROP COLUMN "visibility";
