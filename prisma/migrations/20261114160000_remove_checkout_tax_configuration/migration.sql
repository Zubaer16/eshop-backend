BEGIN;
-- Historical reservation and order tax_minor amounts remain part of their snapshots.
ALTER TABLE "checkout_rates" DROP COLUMN "tax_bps";
ALTER TABLE "checkout_default_rates" DROP COLUMN "tax_bps";
COMMIT;
