-- G8 devices, independent FCM receipts/attempts, approved campaigns and rich inbox references.
BEGIN;
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "campaign_id" UUID,
ADD COLUMN     "image_media_id" UUID;

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "project_id" VARCHAR(60) NOT NULL,
    "surface" VARCHAR(20) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_ciphertext" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "session_version" INTEGER NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_event_receipts" (
    "event_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failure_code" VARCHAR(60),
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_event_receipts_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "push_campaigns" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "audience" VARCHAR(30) NOT NULL,
    "status" VARCHAR(25) NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID,
    "image_media_id" UUID,
    "scheduled_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "fanout_cursor" UUID,
    "fanout_attempts" INTEGER NOT NULL DEFAULT 0,
    "fanout_failure_code" VARCHAR(60),
    "retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_campaign_audiences" (
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "push_campaign_audiences_pkey" PRIMARY KEY ("campaign_id","user_id")
);

-- CreateTable
CREATE TABLE "push_campaign_recipients" (
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "in_app_created" BOOLEAN NOT NULL,
    "push_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_campaign_recipients_pkey" PRIMARY KEY ("campaign_id","user_id")
);

-- CreateTable
CREATE TABLE "push_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "device_revision" INTEGER NOT NULL,
    "campaign_id" UUID,
    "image_media_id" UUID,
    "kind" VARCHAR(60) NOT NULL,
    "audience" VARCHAR(20) NOT NULL,
    "permission_key" VARCHAR(80),
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMP(3),
    "failure_code" VARCHAR(60),
    "provider_message_id" VARCHAR(250),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_delivery_attempts" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "failure_code" VARCHAR(60),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "push_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_hash_key" ON "push_devices"("token_hash");

-- CreateIndex
CREATE INDEX "push_devices_user_id_status_expires_at_idx" ON "push_devices"("user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_user_id_installation_id_surface_key" ON "push_devices"("user_id", "installation_id", "surface");

-- CreateIndex
CREATE INDEX "push_event_receipts_status_next_attempt_at_idx" ON "push_event_receipts"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_campaigns_event_id_key" ON "push_campaigns"("event_id");

-- CreateIndex
CREATE INDEX "push_campaigns_image_media_id_idx" ON "push_campaigns"("image_media_id");

-- CreateIndex
CREATE INDEX "push_campaigns_status_scheduled_at_idx" ON "push_campaigns"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "push_deliveries_status_next_attempt_at_created_at_idx" ON "push_deliveries"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "push_deliveries_campaign_id_idx" ON "push_deliveries"("campaign_id");

-- CreateIndex
CREATE INDEX "push_deliveries_image_media_id_idx" ON "push_deliveries"("image_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_deliveries_event_id_device_id_key" ON "push_deliveries"("event_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_delivery_attempts_delivery_id_number_key" ON "push_delivery_attempts"("delivery_id", "number");

-- CreateIndex
CREATE INDEX "notifications_image_media_id_idx" ON "notifications"("image_media_id");

-- CreateIndex
CREATE INDEX "notifications_campaign_id_idx" ON "notifications"("campaign_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_event_receipts" ADD CONSTRAINT "push_event_receipts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaigns" ADD CONSTRAINT "push_campaigns_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaigns" ADD CONSTRAINT "push_campaigns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaign_audiences" ADD CONSTRAINT "push_campaign_audiences_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaign_audiences" ADD CONSTRAINT "push_campaign_audiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaign_recipients" ADD CONSTRAINT "push_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaign_recipients" ADD CONSTRAINT "push_campaign_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_delivery_attempts" ADD CONSTRAINT "push_delivery_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "push_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE notifications DROP CONSTRAINT notification_bounds;
ALTER TABLE notifications ADD CONSTRAINT notification_bounds CHECK (
 audience IN ('CUSTOMER','ADMIN','SECURITY','MARKETING') AND target_type IN ('ORDER','TRACKING','PRODUCT','HOME','CATEGORY','COLLECTION','OFFER')
 AND ((target_type='HOME')=(target_id IS NULL)) AND ((audience='ADMIN')=(permission_key IS NOT NULL))
 AND ((audience='MARKETING')=(campaign_id IS NOT NULL)) AND (image_media_id IS NULL OR audience='MARKETING')
 AND template_revision>=0 AND length(btrim(title))>0 AND length(btrim(body))>0
);
ALTER TABLE push_devices ADD CONSTRAINT push_device_bounds CHECK (surface IN ('STOREFRONT','ADMIN') AND status IN ('ACTIVE','REVOKED','INVALID') AND revision>0 AND session_version>=0 AND expires_at>last_seen_at AND token_hash ~ '^[0-9a-f]{64}$' AND ((status='ACTIVE')=(token_ciphertext IS NOT NULL)) AND (token_ciphertext IS NULL OR jsonb_typeof(token_ciphertext)='object'));
ALTER TABLE push_event_receipts ADD CONSTRAINT push_receipt_bounds CHECK (status IN ('COMPLETED','SKIPPED','FAILED') AND attempts BETWEEN 1 AND 5 AND ((status IN ('COMPLETED','SKIPPED'))=(processed_at IS NOT NULL)));
ALTER TABLE push_campaigns ADD CONSTRAINT push_campaign_bounds CHECK (
 status IN ('DRAFT','SCHEDULED','FANOUT','FANOUT_COMPLETE','CANCELLED','REQUIRES_REVIEW') AND audience IN ('ALL_OPTED_IN_CUSTOMERS','SELECTED_CUSTOMERS') AND revision>0 AND length(btrim(title))>0 AND length(btrim(body))>0
 AND target_type IN ('HOME','PRODUCT','CATEGORY','COLLECTION','OFFER') AND ((target_type='HOME')=(target_id IS NULL))
 AND ((approved_at IS NULL)=(approved_by_id IS NULL)) AND ((approved_at IS NULL)=(event_id IS NULL))
 AND (status IN ('DRAFT','CANCELLED') OR (approved_at IS NOT NULL AND scheduled_at IS NOT NULL))
 AND (status<>'DRAFT' OR (approved_at IS NULL AND scheduled_at IS NULL AND started_at IS NULL))
 AND (status<>'CANCELLED' OR image_media_id IS NULL) AND (status<>'FANOUT_COMPLETE' OR completed_at IS NOT NULL)
 AND (completed_at IS NULL OR started_at IS NOT NULL) AND (started_at IS NULL OR approved_at IS NOT NULL)
 AND fanout_attempts BETWEEN 0 AND 5
);
ALTER TABLE push_campaign_recipients ADD CONSTRAINT push_campaign_recipient_bounds CHECK (push_count BETWEEN 0 AND 10);
ALTER TABLE push_deliveries ADD CONSTRAINT push_delivery_bounds CHECK (
 status IN ('PENDING','PROCESSING','ACCEPTED','SKIPPED','FAILED','REJECTED','REQUIRES_REVIEW') AND attempts BETWEEN 0 AND 5 AND (status='PENDING' OR attempts>0)
 AND ((status='PROCESSING')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)) AND ((lease_token IS NULL)=(lease_expires_at IS NULL))
 AND ((status='ACCEPTED')=(accepted_at IS NOT NULL)) AND ((status='ACCEPTED')=(provider_message_id IS NOT NULL))
 AND audience IN ('CUSTOMER','ADMIN','SECURITY','MARKETING') AND ((audience='ADMIN')=(permission_key IS NOT NULL)) AND ((audience='MARKETING')=(campaign_id IS NOT NULL))
 AND (image_media_id IS NULL OR audience='MARKETING') AND device_revision>0 AND length(btrim(title))>0 AND length(btrim(body))>0
 AND target_type IN ('ORDER','TRACKING','PRODUCT','HOME','CATEGORY','COLLECTION','OFFER') AND ((target_type='HOME')=(target_id IS NULL))
);
ALTER TABLE push_delivery_attempts ADD CONSTRAINT push_attempt_bounds CHECK (number BETWEEN 1 AND 5 AND status IN ('STARTED','ACCEPTED','SKIPPED','FAILED','REJECTED','REQUIRES_REVIEW') AND ((status='STARTED')=(finished_at IS NULL)));
COMMIT;
