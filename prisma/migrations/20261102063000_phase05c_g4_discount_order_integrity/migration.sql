-- Evolve the existing money identity atomically; never change applied migration SQL.
BEGIN;
ALTER TABLE "orders" DROP CONSTRAINT "orders_amount_bounds";
ALTER TABLE "orders" ADD CONSTRAINT "orders_amount_bounds" CHECK (
  "subtotal_minor" >= 0 AND "shipping_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" >= 0
  AND "discount_minor" >= 0 AND "discount_minor" <= "subtotal_minor"
  AND "subtotal_minor"::bigint - "discount_minor" + "shipping_minor" + "tax_minor" = "total_minor"
);
COMMIT;
