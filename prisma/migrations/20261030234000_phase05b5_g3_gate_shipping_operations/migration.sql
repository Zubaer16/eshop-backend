-- Additive G3 shipping-zone and presentation configuration. Old rates stay usable.
CREATE TYPE "DeliveryKind" AS ENUM ('STANDARD', 'EXPRESS');
CREATE TABLE "store_operations" (
    "key" VARCHAR(20) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en-US',
    "display_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "order_prefix" VARCHAR(8) NOT NULL DEFAULT 'KB',
    "theme_mode" VARCHAR(8) NOT NULL DEFAULT 'system',
    "accent_color" VARCHAR(7) NOT NULL DEFAULT '#1F2937',
    "storefront_origin" VARCHAR(200) NOT NULL DEFAULT '',
    "admin_origin" VARCHAR(200) NOT NULL DEFAULT '',
    "show_wishlist" BOOLEAN NOT NULL DEFAULT true,
    "show_policies" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "store_operations_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "store_operations_primary_only" CHECK ("key" = 'primary'),
    CONSTRAINT "store_operations_revision_check" CHECK ("revision" > 0)
);
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_zones_revision_check" CHECK ("revision" > 0)
);
CREATE TABLE "delivery_zone_countries" (
    "country_code" VARCHAR(2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "zone_id" UUID NOT NULL,
    CONSTRAINT "delivery_zone_countries_pkey" PRIMARY KEY ("country_code", "currency")
);
CREATE TABLE "delivery_zone_services" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "kind" "DeliveryKind" NOT NULL,
    "shipping_minor" INTEGER NOT NULL,
    "free_over_subtotal_minor" INTEGER,
    "eta_note" VARCHAR(100) NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "delivery_zone_services_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_zone_services_money_check" CHECK (
        "shipping_minor" BETWEEN 0 AND 2147483647 AND
        ("free_over_subtotal_minor" IS NULL OR "free_over_subtotal_minor" BETWEEN 0 AND 2147483647)
    )
);
CREATE UNIQUE INDEX "delivery_zones_name_currency_key" ON "delivery_zones"("name", "currency");
CREATE INDEX "delivery_zone_countries_zone_id_idx" ON "delivery_zone_countries"("zone_id");
CREATE UNIQUE INDEX "delivery_zone_services_zone_kind_key" ON "delivery_zone_services"("zone_id", "kind");
ALTER TABLE "delivery_zone_countries" ADD CONSTRAINT "delivery_zone_countries_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_zone_services" ADD CONSTRAINT "delivery_zone_services_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkout_reservations" ADD COLUMN "delivery_kind" "DeliveryKind";
ALTER TABLE "orders" ADD COLUMN "delivery_kind" "DeliveryKind";
