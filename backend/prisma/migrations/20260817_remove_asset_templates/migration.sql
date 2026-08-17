-- Drop the asset-templates feature (model no longer used)
-- Removal order: FK constraint -> index -> column -> table

-- Drop FK from assets -> asset_templates
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_asset_template_id_fkey";

-- Drop the index on the column being removed
DROP INDEX IF EXISTS "assets_asset_template_id_idx";

-- Drop the column from assets
ALTER TABLE "assets" DROP COLUMN IF EXISTS "asset_template_id";

-- Drop the asset_templates table and its unique name index
DROP TABLE IF EXISTS "asset_templates";