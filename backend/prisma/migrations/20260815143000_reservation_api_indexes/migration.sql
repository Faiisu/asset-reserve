-- Optimize approved/pending overlap checks by reservation status and time range.
CREATE INDEX "reservations_status_start_at_end_at_idx"
ON "reservations"("status", "start_at", "end_at");

-- Cover the asset/status lookup and reservation join used by availability checks.
CREATE INDEX "reservation_items_asset_id_status_reservation_id_idx"
ON "reservation_items"("asset_id", "status", "reservation_id");

-- Keep the edit-request workflow deterministic under concurrent submissions.
CREATE UNIQUE INDEX "reservation_change_requests_one_pending"
ON "reservation_change_requests"("reservation_id")
WHERE "status" = 'PENDING';
