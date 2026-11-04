-- New G5 objects only; no historical migration rewrite or financial changes.
BEGIN;
CREATE TYPE "ContentPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TABLE "store_banners" (
  "id" UUID NOT NULL PRIMARY KEY,
  "headline" VARCHAR(160) NOT NULL,
  "subtitle" VARCHAR(500) NOT NULL,
  "cta_text" VARCHAR(60) NOT NULL,
  "cta_href" VARCHAR(300) NOT NULL,
  "slot" VARCHAR(20) NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "ContentPublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "image_media_id" UUID,
  "image_alt" VARCHAR(250) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_banners_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "store_banners_bounds" CHECK (
    "revision" > 0 AND "position" BETWEEN 1 AND 99 AND "slot" IN ('hero','secondary','promo')
    AND length(btrim("headline")) >= 3 AND length(btrim("cta_text")) >= 2
    AND ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
    AND ("image_media_id" IS NULL OR length(btrim("image_alt")) > 0)
    AND ("status" <> 'ARCHIVED' OR "image_media_id" IS NULL)
  )
);
CREATE TABLE "featured_collections" (
  "id" UUID NOT NULL PRIMARY KEY,
  "slug" VARCHAR(120) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "ContentPublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "featured_collections_bounds" CHECK (
    "revision" > 0 AND "position" BETWEEN 1 AND 99 AND length(btrim("title")) >= 3
    AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
  )
);
CREATE TABLE "featured_collection_products" (
  "collection_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "featured_collection_products_pkey" PRIMARY KEY ("collection_id", "product_id"),
  CONSTRAINT "featured_collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "featured_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "featured_collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "featured_collection_products_position_bounds" CHECK ("position" BETWEEN 0 AND 49)
);
CREATE INDEX "store_banners_status_position_idx" ON "store_banners"("status","position");
CREATE INDEX "store_banners_image_media_id_idx" ON "store_banners"("image_media_id");
CREATE UNIQUE INDEX "featured_collections_slug_key" ON "featured_collections"("slug");
CREATE UNIQUE INDEX "featured_collections_title_ci_key" ON "featured_collections"(lower("title"));
CREATE INDEX "featured_collections_status_position_idx" ON "featured_collections"("status","position");
CREATE UNIQUE INDEX "featured_collection_products_collection_id_position_key" ON "featured_collection_products"("collection_id","position");
CREATE INDEX "featured_collection_products_product_id_idx" ON "featured_collection_products"("product_id");
COMMIT;
