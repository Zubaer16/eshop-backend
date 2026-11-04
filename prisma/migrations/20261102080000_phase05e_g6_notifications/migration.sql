-- G6 durable in-app subscriber, independent of existing outbox consumers.
BEGIN;
-- CreateTable
CREATE TABLE "notification_event_receipts" (
    "event_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failure_code" VARCHAR(60),
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_event_receipts_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "audience" VARCHAR(20) NOT NULL,
    "permission_key" VARCHAR(80),
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(600) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID,
    "template_revision" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "transactional_email" BOOLEAN NOT NULL DEFAULT true,
    "transactional_push" BOOLEAN NOT NULL DEFAULT true,
    "operational_in_app" BOOLEAN NOT NULL DEFAULT true,
    "operational_email" BOOLEAN NOT NULL DEFAULT false,
    "operational_push" BOOLEAN NOT NULL DEFAULT true,
    "marketing_in_app" BOOLEAN NOT NULL DEFAULT false,
    "marketing_email" BOOLEAN NOT NULL DEFAULT false,
    "marketing_push" BOOLEAN NOT NULL DEFAULT false,
    "marketing_consent_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "key" VARCHAR(60) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(600) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "notification_event_receipts_status_next_attempt_at_idx" ON "notification_event_receipts"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_id_idx" ON "notifications"("created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_event_id_audience_key" ON "notifications"("event_id", "audience");

-- CreateIndex
CREATE INDEX "notification_recipients_user_id_read_at_created_at_id_idx" ON "notification_recipients"("user_id", "read_at", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notification_id_user_id_key" ON "notification_recipients"("notification_id", "user_id");

-- AddForeignKey
ALTER TABLE "notification_event_receipts" ADD CONSTRAINT "notification_event_receipts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE notification_event_receipts ADD CONSTRAINT notification_receipt_bounds CHECK (status IN ('PENDING','COMPLETED','FAILED') AND attempts BETWEEN 0 AND 10 AND ((status = 'COMPLETED') = (processed_at IS NOT NULL)));
ALTER TABLE notifications ADD CONSTRAINT notification_bounds CHECK (audience IN ('CUSTOMER','ADMIN','SECURITY') AND target_type IN ('ORDER','TRACKING','PRODUCT','HOME') AND ((target_type = 'HOME') = (target_id IS NULL)) AND ((audience = 'ADMIN') = (permission_key IS NOT NULL)) AND template_revision >= 0 AND length(btrim(title)) > 0 AND length(btrim(body)) > 0);
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preference_bounds CHECK (revision > 0 AND ((marketing_in_app OR marketing_email OR marketing_push) = (marketing_consent_at IS NOT NULL)));
ALTER TABLE notification_templates ADD CONSTRAINT notification_template_bounds CHECK (revision > 0 AND length(btrim(title)) > 0 AND length(btrim(body)) > 0);
CREATE INDEX outbox_events_notification_scan_idx ON outbox_events(event_type, created_at, id);

-- Capture threshold crossings in the same transaction regardless of the stock writer.
-- Existing media/payment outbox status belongs to those consumers; do not change it here.
CREATE FUNCTION emit_inventory_low_stock_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.on_hand > OLD.low_stock_threshold AND NEW.on_hand <= NEW.low_stock_threshold THEN
    INSERT INTO outbox_events(id,event_type,payload,status,attempts,available_at,created_at,updated_at)
    VALUES (gen_random_uuid(),'inventory.low_stock',jsonb_build_object('balanceId',NEW.id),'PENDING',0,CURRENT_TIMESTAMP AT TIME ZONE 'UTC',CURRENT_TIMESTAMP AT TIME ZONE 'UTC',CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_low_stock_notification AFTER UPDATE OF on_hand,low_stock_threshold ON inventory_balances FOR EACH ROW EXECUTE FUNCTION emit_inventory_low_stock_notification();
COMMIT;
