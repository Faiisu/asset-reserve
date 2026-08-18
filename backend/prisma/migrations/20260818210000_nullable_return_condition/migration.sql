-- Condition is decided at return inspection (decide()), not at drop-off submission
-- (create()) -- so return_item_units rows now exist from submission with a null
-- condition until the inspecting manager records GOOD/BROKEN/LOST.
ALTER TABLE "return_item_units" ALTER COLUMN "condition" DROP NOT NULL;

ALTER TABLE "return_item_units" DROP CONSTRAINT "return_item_units_condition_check";
ALTER TABLE "return_item_units" ADD CONSTRAINT "return_item_units_condition_check"
  CHECK ("condition" IS NULL OR "condition" IN ('GOOD', 'BROKEN', 'LOST'));
