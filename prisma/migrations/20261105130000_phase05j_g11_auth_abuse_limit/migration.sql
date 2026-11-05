-- G11 / 05J: shared fixed-window throttle for credential endpoints.
-- Digest keys are HMAC-SHA256 of a route category and client network address;
-- raw IPs, account names and auth tokens are never stored.
-- Additive migration: no previously applied migration is changed.
CREATE TABLE "auth_abuse_buckets" (
    "key_hash" VARCHAR(64) NOT NULL,
    "window_start" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "auth_abuse_buckets_pkey" PRIMARY KEY ("key_hash"),
    CONSTRAINT "auth_abuse_buckets_attempts_check" CHECK ("attempts" >= 1)
);
CREATE INDEX "auth_abuse_buckets_expires_at_idx"
    ON "auth_abuse_buckets"("expires_at");
