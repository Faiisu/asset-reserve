-- Reputation system (v1): a behavior score per user, 0-100, starting at 100.
-- Moved only by the backend's ReputationService.recordReturnOutcome when a
-- return is approved (late/on-time +-5, broken/lost -5 each, applied to the
-- reservation's requester and every participant). This migration is purely
-- additive: a new column with a safe default and a new table, so it needs
-- no backfill and is safe to run on a populated database.

ALTER TABLE "users" ADD COLUMN "reputation" INTEGER NOT NULL DEFAULT 100;

-- Audit log: one row per individual effect (a return with 2 broken units
-- affecting 3 people produces 3 late/on-time rows + 6 broken rows), so the
-- admin/self-service history views can show exactly what happened and why,
-- not just the running total.
CREATE TABLE "reputation_events" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id"),
  "reservation_id" UUID REFERENCES "reservations"("id"),
  "return_id" UUID REFERENCES "returns"("id"),
  "type" VARCHAR(20) NOT NULL, -- RETURN_ON_TIME, RETURN_LATE, ASSET_BROKEN, ASSET_LOST
  "delta" INTEGER NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "reputation_events_user_id_created_at_idx" ON "reputation_events"("user_id", "created_at");
CREATE INDEX "reputation_events_return_id_idx" ON "reputation_events"("return_id");

-- Rollback (manual, before deploying the old application):
--   DROP TABLE "reputation_events";
--   ALTER TABLE "users" DROP COLUMN "reputation";
