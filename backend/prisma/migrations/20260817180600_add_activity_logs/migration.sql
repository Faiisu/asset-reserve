-- CreateTable: activity_logs
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" UUID NOT NULL,
    "reservation_id" UUID,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "activity_logs_reservation_id_created_at_idx" ON "activity_logs"("reservation_id", "created_at");
CREATE INDEX IF NOT EXISTS "activity_logs_actor_id_created_at_idx" ON "activity_logs"("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "activity_logs_action_created_at_idx" ON "activity_logs"("action", "created_at");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_reservation_id_fkey'
    ) THEN
        ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_actor_id_fkey'
    ) THEN
        ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
