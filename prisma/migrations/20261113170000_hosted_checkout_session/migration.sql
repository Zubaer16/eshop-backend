ALTER TABLE "payment_attempts"
  ADD COLUMN "checkout_session_id" VARCHAR(128),
  ADD COLUMN "checkout_url" VARCHAR(2048),
  ADD COLUMN "checkout_expires_at" TIMESTAMP(3),
  ADD COLUMN "checkout_return_origin" VARCHAR(512);
CREATE UNIQUE INDEX "payment_attempts_checkout_session_id_key" ON "payment_attempts"("checkout_session_id");
