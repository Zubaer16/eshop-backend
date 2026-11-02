-- Additive G4; existing schema drift is deliberately excluded.
BEGIN;

CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

CREATE TYPE "PromotionCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED');

ALTER TABLE "checkout_reservation_lines" ADD COLUMN     "discount_minor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "checkout_reservations" ADD COLUMN     "coupon_code" VARCHAR(24),
ADD COLUMN     "coupon_snapshot" JSONB,
ADD COLUMN     "discount_minor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "order_lines" ADD COLUMN     "discount_minor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "orders" ADD COLUMN     "coupon_code" VARCHAR(24),
ADD COLUMN     "coupon_snapshot" JSONB,
ADD COLUMN     "discount_minor" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "promotion_campaigns" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" "PromotionCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minimum_subtotal_minor" INTEGER NOT NULL DEFAULT 0,
    "maximum_discount_minor" INTEGER,
    "usage_limit" INTEGER,
    "per_customer_limit" INTEGER,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "category_id" UUID,
    "campaign_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "discount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promotion_campaigns_slug_key" ON "promotion_campaigns"("slug");

CREATE INDEX "promotion_campaigns_status_starts_at_ends_at_idx" ON "promotion_campaigns"("status", "starts_at", "ends_at");

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

CREATE INDEX "coupons_category_id_idx" ON "coupons"("category_id");

CREATE INDEX "coupons_campaign_id_idx" ON "coupons"("campaign_id");

CREATE UNIQUE INDEX "coupon_redemptions_reservation_id_key" ON "coupon_redemptions"("reservation_id");

CREATE INDEX "coupon_redemptions_coupon_id_customer_id_idx" ON "coupon_redemptions"("coupon_id", "customer_id");

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "promotion_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "checkout_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_rules_check" CHECK (
  revision > 0 AND code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$' AND currency ~ '^[A-Z]{3}$' AND
  value > 0 AND (kind <> 'PERCENT' OR value <= 10000) AND minimum_subtotal_minor >= 0 AND
  (maximum_discount_minor IS NULL OR maximum_discount_minor > 0) AND
  (usage_limit IS NULL OR usage_limit > 0) AND (per_customer_limit IS NULL OR per_customer_limit > 0) AND
  (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_window_check" CHECK (
  revision > 0 AND (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at) AND
  (status NOT IN ('ACTIVE','SCHEDULED') OR (starts_at IS NOT NULL AND ends_at IS NOT NULL))
);
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_discount_check" CHECK (discount_minor > 0);
ALTER TABLE "checkout_reservations" ADD CONSTRAINT "checkout_reservations_discount_check" CHECK (discount_minor >= 0 AND discount_minor <= subtotal_minor);
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_check" CHECK (discount_minor >= 0 AND discount_minor <= subtotal_minor);
ALTER TABLE "checkout_reservation_lines" ADD CONSTRAINT "checkout_reservation_lines_discount_check" CHECK (discount_minor >= 0 AND discount_minor <= unit_price_minor::bigint * quantity);
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_discount_check" CHECK (discount_minor >= 0 AND discount_minor <= line_total_minor);


COMMIT;
