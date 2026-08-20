-- Add columns documented in database-schema.md and the OpenAPI contract
-- (CreateReturnRequest.note, ReturnItemDetail.pictureUrl,
-- ReturnItemUnitDetail.pictureUrl/note) that were missing from the schema.
ALTER TABLE "returns" ADD COLUMN "note" TEXT;
ALTER TABLE "return_items" ADD COLUMN "picture_url" TEXT;
ALTER TABLE "return_item_units" ADD COLUMN "picture_url" TEXT, ADD COLUMN "note" TEXT;
