CREATE INDEX "reservations_created_at_id_idx"
ON "reservations" ("created_at", "id");

CREATE INDEX "reservations_status_created_at_id_idx"
ON "reservations" ("status", "created_at", "id");

DROP INDEX "reservations_status_idx";
