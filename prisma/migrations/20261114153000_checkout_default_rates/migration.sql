BEGIN;
CREATE TABLE "checkout_default_rates" (
    "currency" VARCHAR(3) NOT NULL,
    "shipping_minor" INTEGER NOT NULL,
    "free_over_subtotal_minor" INTEGER,
    "tax_bps" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checkout_default_rates_pkey" PRIMARY KEY ("currency"),
    CONSTRAINT "checkout_default_rates_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "checkout_default_rates_shipping_check" CHECK ("shipping_minor" >= 0),
    CONSTRAINT "checkout_default_rates_threshold_check" CHECK ("free_over_subtotal_minor" IS NULL OR "free_over_subtotal_minor" >= 0),
    CONSTRAINT "checkout_default_rates_tax_check" CHECK ("tax_bps" BETWEEN 0 AND 10000),
    CONSTRAINT "checkout_default_rates_revision_check" CHECK ("revision" >= 1)
);
COMMIT;
