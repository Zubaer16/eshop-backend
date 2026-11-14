-- Preserve existing orders, payment attempts and reserved inventory allocations.
-- Nullable request_hash marks historical reservations created by the former flow.
ALTER TABLE "checkout_reservations" ADD COLUMN "request_hash" VARCHAR(64);
ALTER TABLE "checkout_reservations" DROP COLUMN "cart_id";
ALTER TABLE "orders" DROP COLUMN "cart_id";
DROP TABLE "cart_items";
DROP TABLE "guest_cart_items";
DROP TABLE "guest_carts";
DROP TABLE "carts";
