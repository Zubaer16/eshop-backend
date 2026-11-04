-- G7 email subscriber and durable SMTP submission ledger. No historical SQL rewrite.
BEGIN;
-- CreateTable
CREATE TABLE "email_event_receipts" (
    "event_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failure_code" VARCHAR(60),
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_event_receipts_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "audience" VARCHAR(20) NOT NULL,
    "recipient_hash" VARCHAR(64) NOT NULL,
    "permission_key" VARCHAR(80),
    "subject" VARCHAR(160) NOT NULL,
    "text" VARCHAR(1800) NOT NULL,
    "template_revision" INTEGER NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMP(3),
    "failure_code" VARCHAR(60),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_attempts" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "failure_code" VARCHAR(60),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "email_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "key" VARCHAR(60) NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "text" VARCHAR(1800) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "email_event_receipts_status_next_attempt_at_idx" ON "email_event_receipts"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_deliveries_status_next_attempt_at_created_at_idx" ON "email_deliveries"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_event_id_user_id_kind_key" ON "email_deliveries"("event_id", "user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_attempts_delivery_id_number_key" ON "email_delivery_attempts"("delivery_id", "number");

-- AddForeignKey
ALTER TABLE "email_event_receipts" ADD CONSTRAINT "email_event_receipts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_attempts" ADD CONSTRAINT "email_delivery_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "email_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE email_event_receipts ADD CONSTRAINT email_event_receipt_bounds CHECK (status IN ('COMPLETED','SKIPPED','FAILED') AND attempts BETWEEN 1 AND 5 AND ((status IN ('COMPLETED','SKIPPED')) = (processed_at IS NOT NULL)));
ALTER TABLE email_deliveries ADD CONSTRAINT email_delivery_bounds CHECK (
 status IN ('PENDING','PROCESSING','ACCEPTED','SKIPPED','FAILED','REJECTED','REQUIRES_REVIEW') AND attempts BETWEEN 0 AND 5
 AND (status = 'PENDING' OR attempts > 0)
 AND ((status = 'PROCESSING') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
 AND ((lease_token IS NULL) = (lease_expires_at IS NULL))
 AND ((status = 'ACCEPTED') = (accepted_at IS NOT NULL))
 AND audience IN ('CUSTOMER','ADMIN','SECURITY') AND ((audience = 'ADMIN') = (permission_key IS NOT NULL))
 AND target_type IN ('ORDER','TRACKING','PRODUCT','HOME') AND ((target_type = 'HOME') = (target_id IS NULL))
 AND recipient_hash ~ '^[0-9a-f]{64}$' AND template_revision >= 0 AND length(btrim(subject)) > 0 AND length(btrim(text)) > 0
);
ALTER TABLE email_delivery_attempts ADD CONSTRAINT email_attempt_bounds CHECK (number BETWEEN 1 AND 5 AND status IN ('STARTED','ACCEPTED','SKIPPED','FAILED','REJECTED','REQUIRES_REVIEW') AND ((status = 'STARTED') = (finished_at IS NULL)));
ALTER TABLE email_templates ADD CONSTRAINT email_template_bounds CHECK (revision > 0 AND length(btrim(subject)) > 0 AND length(btrim(text)) > 0);
COMMIT;
