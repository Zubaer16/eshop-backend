-- G9 indexes for bounded authoritative reporting; no data rewrite or new reporting ledger.
BEGIN;
CREATE INDEX "users_role_created_at_id_idx" ON "users"("role","created_at","id");
CREATE INDEX "orders_created_at_id_idx" ON "orders"("created_at","id");
CREATE INDEX "payment_attempts_created_at_id_idx" ON "payment_attempts"("created_at","id");
CREATE INDEX "payment_transactions_created_at_currency_idx" ON "payment_transactions"("created_at","currency");
CREATE INDEX "refund_requests_status_confirmed_at_currency_idx" ON "refund_requests"("status","confirmed_at","currency");
CREATE INDEX "audit_events_actor_id_created_at_id_idx" ON "audit_events"("actor_id","created_at","id");
CREATE INDEX "audit_events_target_type_created_at_id_idx" ON "audit_events"("target_type","created_at","id");
COMMIT;
