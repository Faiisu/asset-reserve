-- Remove the ReservationChangeRequest feature. Decommissioned per
-- docs/software_spec/scope-and-roadmap.md ("Feature ที่ถูกยกเลิก"): all doc
-- references (contract, database-schema, algorithms, permissions, lifecycle,
-- frontend spec) were already removed, but the backend/database code was
-- left behind. This drops the table the docs say must go.
ALTER TABLE "reservation_change_requests" DROP CONSTRAINT "reservation_change_requests_requested_by_fkey";
ALTER TABLE "reservation_change_requests" DROP CONSTRAINT "reservation_change_requests_reservation_id_fkey";
ALTER TABLE "reservation_change_requests" DROP CONSTRAINT "reservation_change_requests_reviewed_by_fkey";

DROP TABLE "reservation_change_requests";
