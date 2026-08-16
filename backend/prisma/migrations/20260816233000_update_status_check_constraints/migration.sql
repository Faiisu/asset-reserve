-- Update status CHECK constraints for reservations and reservation_items to support the full delivery and return lifecycle
ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "reservations_status_check";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_status_check" 
  CHECK ("status" IN ('DRAFT', 'PENDING', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'DELIVERY_CONFIRMED', 'ACTIVE', 'RETURN', 'RETURN_PENDING', 'RETURN_CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED'));

ALTER TABLE "reservation_items" DROP CONSTRAINT IF EXISTS "reservation_items_status_check";
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_status_check" 
  CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'PREPARED', 'CHECKED_OUT', 'DELIVERED', 'RETURNED'));

-- Allow audit transactions for returns where delta is 0 (normal restock) or >= 0 (recovered lost), and BROKEN/LOST where delta <= 0
ALTER TABLE "asset_transactions" DROP CONSTRAINT IF EXISTS "asset_transactions_quantity_delta_check";
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_quantity_delta_check"
  CHECK (
    ("transaction_type" = 'ADD' AND "quantity_delta" > 0) OR
    ("transaction_type" = 'REMOVE' AND "quantity_delta" < 0) OR
    ("transaction_type" = 'RETURN' AND "quantity_delta" >= 0) OR
    ("transaction_type" IN ('LOST', 'BROKEN') AND "quantity_delta" <= 0) OR
    ("transaction_type" IN ('REPAIR', 'ADJUSTMENT'))
  );
