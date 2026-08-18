-- CreateTable: reservation_handovers
CREATE TABLE IF NOT EXISTS "reservation_handovers" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "handled_by" UUID NOT NULL,
    "photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" VARCHAR(2000),
    "handed_over_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_handovers_pkey" PRIMARY KEY ("id")
);

-- Add handover columns to reservation_items
ALTER TABLE "reservation_items" ADD COLUMN IF NOT EXISTS "handover_photo_url" VARCHAR(1000);
ALTER TABLE "reservation_items" ADD COLUMN IF NOT EXISTS "handover_id" UUID;

-- Add photo_urls and note to returns
ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "note" VARCHAR(2000);

-- Add photo_url to return_items
ALTER TABLE "return_items" ADD COLUMN IF NOT EXISTS "photo_url" VARCHAR(1000);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "reservation_handovers_reservation_id_idx" ON "reservation_handovers"("reservation_id");
CREATE INDEX IF NOT EXISTS "reservation_handovers_handled_by_idx" ON "reservation_handovers"("handled_by");
CREATE INDEX IF NOT EXISTS "reservation_items_handover_id_idx" ON "reservation_items"("handover_id");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reservation_handovers_reservation_id_fkey'
    ) THEN
        ALTER TABLE "reservation_handovers" ADD CONSTRAINT "reservation_handovers_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reservation_handovers_handled_by_fkey'
    ) THEN
        ALTER TABLE "reservation_handovers" ADD CONSTRAINT "reservation_handovers_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reservation_items_handover_id_fkey'
    ) THEN
        ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "reservation_handovers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
