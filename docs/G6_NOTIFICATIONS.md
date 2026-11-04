# G6 notification engine

Status (2026-11-02): IMPLEMENTED / FULL VALIDATION PENDING. All automated test execution is deferred to G12 by owner instruction. This batch preserves the existing uncommitted G5 work.

## Inbox and administrative contracts

All routes use /v1 and current database-backed bearer authentication. One own inbox serves customers and staff; callers cannot specify another user ID. GET /notifications accepts page, limit up to 50 and readState=all|unread; it returns safe items, total, unread, page, limit and pages. Ordering is newest source-event time, then recipient UUID. Public item IDs identify the current user's recipient row, not a shared notification or raw event. Internal source payload, user IDs, permissions, template revisions and provider identifiers are omitted. GET responses use no-store.

PUT /notifications/:id/read takes read=true/false and is idempotent when marking read. PUT /notifications/read-all takes an explicit timezone-qualified before timestamp; later items remain unread. GET /notifications/:id/target resolves an owned visible typed destination and rechecks the underlying order ownership/existence or product existence. Clients still use the protected Orders/Tracking/Admin APIs after navigation. No arbitrary redirect URL is accepted.

GET/PUT /notifications/preferences use optimistic revisions (0 means the unpersisted defaults). Separate transactional email/push, operational in-app/email/push and marketing in-app/email/push flags are persisted. Marketing defaults off and opting into any marketing channel records consent time; withdrawing all clears current consent. Audit records the preference change. Security email and transactional/security in-app history remain required, independently of optional marketing consent. G7/G8 must enforce these policies when implementing transports; storing a preference does not send a message or grant browser push permission.

OWNER-only GET /admin/notifications/templates lists built-in English templates with persisted plain-text overrides. PUT /admin/notifications/templates/:key uses expectedRevision; only the event's orderId or productId placeholders are allowed, no HTML, controls, arbitrary variables or credentials. Revision 0 creates the first override. Existing inbox content is immutable after template edits. GET /admin/notifications/failures is bounded/paginated and returns only source event ID/type, attempts, safe failure code, next retry time and exhausted flag. It never returns source payloads or exception text. Other staff have their own permitted operational inbox, without access to global template/failure administration.

## Event routing and authority

| Source event                                                                                    | Destination / evidence                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| order.created                                                                                   | Actual persisted order's customer plus active staff with orders.manage; Admin receives operational copy |
| order.cancelled / order.expired                                                                 | Persisted order must match terminal state; customer order target                                        |
| payment.test_settled                                                                            | Matching committed PaymentTransaction and order paidAt required; customer payment success               |
| order.fulfillment.shipped / delivered                                                           | Matching persisted shipment and appropriate shipment state; customer tracking target                    |
| payment.test_refund_succeeded                                                                   | Matching SUCCEEDED refund with confirmedAt and provider refund ID; customer order target                |
| inventory.low_stock                                                                             | Active visible product/variant, current physical stock at/below threshold; staff with inventory.adjust  |
| payment.test_review_required / payment.test_refund_review_required / payment.test_refund_failed | Staff with payments.view; no customer payment-success implication                                       |
| auth.password_changed / auth.password_reset.completed                                           | Same-transaction, user-ID-only security event after successful credential change                        |

Raw payment_intent.succeeded events, browser redirects and encrypted password-reset/email-verification request events are not consumed as success/inbox events. Security action tokens stay in their existing G2/G7 path. Order customer identity comes from the database, not payload customerId. Unmatched payment review can produce a generic operational HOME destination without exposing provider payload. All staff recipients must be active and currently authorized. Staff alert visibility is re-evaluated with current permissions at inbox/read/target time, so revocation hides historical alerts too. Operational in-app opt-out suppresses future operational fanout; required security/customer records remain independent.

Low stock uses physical onHand versus lowStockThreshold, matching the existing Inventory API. An additive PostgreSQL AFTER UPDATE trigger writes an outbox event atomically when a balance crosses from above its previous threshold to at/below its new threshold. It covers inventory adjustments, settlement deductions, threshold changes and future physical stock writers. A failed stock transaction rolls back the event too. Repeated decreases while already low do not repeat the alert; recovery above threshold rearms it. Creation of initially low stock is not a crossing, and reservation-only changes do not generate physical-stock alerts. Recovered stock, archived products and hidden parent balances safely resolve to no-op receipts at dispatch.

## Durable subscriber and operation

Notifications use an independent unique receipt per outbox event. They do not mutate global OutboxEvent.status or attempts, so media/email/payment consumers can process the same event independently. Each applied event holds the source row lock with SKIP LOCKED, checks its receipt, and atomically creates immutable notification snapshots, deduplicated recipients and a completed receipt. A crash rolls the whole event transaction back. Per-event/audience and per-notification/user uniqueness provide replay protection. Inbox snapshots survive later source-event retention; source subscriber receipts follow source deletion.

Failures roll back notification writes and record only a safe code with exponential retry delay, starting at 30 seconds and capped at one hour. Ten failed attempts stop automatic retries and remain visible to OWNER. A concurrent successful completion is never overwritten by failure recording. Candidate batches are at most 200; active staff scanning is capped at 1000 with an explicit visible fanout failure instead of silent partial delivery. Paged large-audience fanout, scheduled worker operation, retention/reconciliation and controlled retry tooling remain G10 hardening work.

The local CLI defaults to preview and requires an explicit source-time boundary to prevent accidental historical fanout:

    npm run notifications:dispatch -- --since 2026-11-02T08:00:00Z --limit 50
    npm run notifications:dispatch -- --since 2026-11-02T08:00:00Z --limit 50 --apply

These are operator examples; neither dispatcher mode was executed during G6. There is no automatic startup worker, outbound email, push send or marketing campaign dispatcher in G6. Deployment scheduling belongs to G10/G11, actual email to G7, FCM/rich media/campaigns to G8. Future transport consumers must use independent receipts and recheck per-channel opt-in/preferences before optional sends.

## Frontend alignment and migration

Current Admin admin-shell.tsx contains a placeholder Bell. Storefront has no operational inbox. Source audit v1.12.0 adds this adapter requirement; no UI work or live integration is claimed. Web integration must implement authenticated inbox/count/read controls, revisioned preferences, permission-aware Admin destinations and safe typed customer navigation. No frontend fixture IDs are authoritative. FCM browser permission/devices and rich target/media types are G8.

Migration 20261102080000_phase05e_g6_notifications adds five tables, uniqueness/FKs/CHECKs, a source-scan index and the atomic stock-crossing trigger/function. It changes no applied historical SQL. Separate dev/test backup and checksum evidence is under external validation/2026-11-02-g6/. Both databases now have 35 active matching applied migrations.

See G6_VALIDATION_STATUS.md. G5/G6 are implemented with runtime validation pending; G2 actual email delivery still waits for G7. Next implementation: G7 email provider and controlled delivery.
