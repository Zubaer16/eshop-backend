# G7 transactional email delivery

Status: IMPLEMENTED / FULL VALIDATION PENDING (2026-11-02). No actual SMTP connection/submission, automated test execution or email worker execution occurred in this batch. Local SMTP configuration remains disabled and credentials are absent. G2 actual verification/recovery delivery acceptance remains open.

## Architecture and authority

EmailModule stays inside the existing NestJS backend. EmailProvider abstracts submission; SmtpEmailProvider uses pinned Nodemailer 10.3.1 (types 8.0.2). Credentials live only in deployment environment configuration, with no HTTP read/write-secret or arbitrary send endpoint. Per-client SMTP settings replace developer demo credentials in production. The package lock adds only Nodemailer and its types; no unrelated dependency upgrades were made.

G6 in-app and G7 email now share notification-event.ts for authoritative order/settlement/refund/shipment/stock resolution and active staff permissions. Email uses an independent source receipt and does not require an in-app recipient or completed G6 receipt. Operational email opt-in works even with operational in-app disabled. Neither subscriber mutates another consumer's OutboxEvent status/attempts.

Customer order/payment/shipping/refund email requires an active user, verified current email address and transactionalEmail enabled. Operational email requires active, verified staff, current matching permission and operationalEmail opt-in. Required password/security notices and verification/reset actions are independent of optional transaction/marketing flags. No marketing campaign email or bulk-mail dispatcher is implemented in G7. Marketing flags remain default-off for future opted-in channels.

The queue checks eligibility when creating immutable subject/plain-text snapshots. The sender rechecks active user, recipient hash, preferences, current permission and authoritative event before each submission. Disabled/deleted recipients, revoked permissions, changed addresses, recovered stock or superseded action challenges are suppressed. A change after the final check can race a submission; the provider cannot atomically participate in a database transaction. No claim of exactly-once SMTP delivery is made.

## Verification and password recovery

New G2 issuance events contain recipientHash in addition to the existing AEAD-encrypted token bound to userId:eventId. Password reset also rechecks the requested email under the user lock before issuance. Neither plaintext token nor email address is copied into email job/attempt/history rows. Sender-side composition decrypts only in memory, then checks the exact current challenge digest/expiry, consumed state, user identity, matching event ID and recipient binding. Expired, consumed, replaced, tampered or unbound historical actions are suppressed. Legacy events issued before G7 need a fresh request/resend; old event payloads are not rewritten.

Links use a deployment-configured bare origin and a fragment token:

- /verify-email#token=... calls POST /v1/auth/email-verification/confirm.
- /reset-password#token=... calls POST /v1/auth/password-reset/confirm with the new password.

The current Storefront lacks those two pages. Their implementation is explicit I-SF integration work; these backend link contracts do not certify a complete browser journey. Web integration must consume/clear the fragment, avoid logging tokens and use the existing one-time APIs. Transactional customer links use the existing authenticated /account/orders/:UUID route; Admin email points to its protected application home. Tokens are not placed in URL query strings, template edits, HTTP debug APIs or normal server logs.

## Deployment configuration

.env.example lists the non-secret variable names. EMAIL_DELIVERY_MODE defaults to disabled. Controlled mode requires complete SMTP/sender/origin configuration plus a bounded explicit EMAIL_RECIPIENT_ALLOWLIST. Both composition and the SMTP adapter enforce the allowlist. Production mode requires NODE_ENV=production. SMTP uses port 465 with immediate TLS or 587 with mandatory STARTTLS; certificate verification stays enabled. No plaintext port, insecure TLS option, protocol logger, file attachment access or URL content fetch is exposed. Connections are non-pooled, bounded by timeouts and closed after submission.

EMAIL_SMTP_HOST/PORT/USER/PASSWORD, EMAIL_FROM_ADDRESS/NAME, optional EMAIL_REPLY_TO, EMAIL_PUBLIC_ORIGIN and EMAIL_ADMIN_ORIGIN are deployment-owned. Sender/reply-to are bare addresses; origins must be bare HTTPS except local development HTTP. Gmail demo uses matching sender/auth identity and an eligible App Password, never the primary account password. Existing AUTH_ACTION_TOKEN_ENCRYPTION_KEY is also required for issuance/decryption of account action tokens. No actual secret was changed or printed in this batch.

Authoritative references inspected during implementation: [Nodemailer SMTP transport](https://nodemailer.com/smtp), [message controls](https://nodemailer.com/message), [Google App Password requirements](https://support.google.com/accounts/answer/185833?hl=en). These are implementation/configuration references, not evidence that this account/provider was tested.

## Durable queue, attempts and review

EmailEventReceipt tracks planning independently of existing subscribers, with source-row locking and five bounded backoff attempts. Unique event/user/kind jobs prevent duplicate queueing. Immutable email snapshots are separate from editable EmailTemplate revisions. A source event is retained by the delivery FK until an explicit retention policy removes its jobs/history; G10 must honor this dependency.

Sending claims a delivery under SKIP LOCKED, commits PROCESSING with a unique five-minute lease and STARTED attempt, then releases the DB transaction before SMTP. A deterministic Message-ID is a dedupe hint, not a provider idempotency guarantee. Final updates are fenced by the lease token, with attempt history and PII-free audit.

| State           | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| PENDING         | Queued; not submitted                                                                        |
| PROCESSING      | Claimed with persistent lease/attempt                                                        |
| ACCEPTED        | SMTP server accepted the recipient/message submission; mailbox delivery is unverified        |
| FAILED          | Known retryable pre-submission or explicit temporary SMTP rejection, with backoff            |
| REJECTED        | Permanent rejection/auth failure or five attempts exhausted                                  |
| SKIPPED         | Current recipient, consent, allowlist, authority or token check no longer permits submission |
| REQUIRES_REVIEW | SMTP outcome uncertain or PROCESSING lease abandoned; automatic resubmission is blocked      |

Backoff starts at 30 seconds and caps at one hour; at most five attempts. A lost worker after submission may have sent the message, so lease recovery records review rather than blindly retrying. A known SMTP 4xx rejection can retry, 5xx/auth failures stop, unknown submission/disconnect outcomes require review. Operator recovery/requeue controls, production scheduling, comprehensive retention and bounce/delivery webhooks belong to G10/G11 or later provider integration. No HTTP override silently turns review into resend.

Queue and sender CLI commands default to preview and require an explicit fixed activation/backfill boundary:

    npm run email:queue -- --since 2026-11-02T09:00:00Z --limit 5
    npm run email:dispatch -- --since 2026-11-02T09:00:00Z --limit 5

Appending --apply makes the corresponding operation mutate state or submit messages when enabled. These commands were not executed in this batch. Scheduled runs must preserve the chosen boundary so pending retries are not excluded by continually moving --since forward. CLI bounds limit to 1..200. G10/G11 own worker scheduling and operational verification.

## OWNER APIs and frontend alignment

All APIs require current OWNER bearer authentication:

- GET /v1/admin/email/status: mode, provider, configuration presence, sender presence, controlled recipient count, TLS mode. providerVerified=false means no provider check was performed; no credential/address allowlist is returned.
- GET /v1/admin/email/templates and PUT /templates/:key: revisioned built-in English template overrides, bounded plain text and only event-appropriate orderId/productId placeholders. No token/actionUrl/sender/HTML injection; trusted action URLs are appended by the sender.
- GET /v1/admin/email/deliveries: paginated safe history, optional status filter; excludes subject, body, recipient/email hash, raw event payload and lease secrets.
- GET /v1/admin/email/planning-failures: bounded page/limit list of safe planning failure/skip codes, including legacy/decryption problems.

No test-send, recipient override, debug token or SMTP credential API exists. Admin needs readiness/templates/history screens; public store support email is unrelated to SMTP credentials. Storefront needs the two action-token pages above. Source alignment v1.13.0 has 6 MATCH / 14 ADAPTER across 20 findings; no live browser-app acceptance is claimed.

## Migration and validation

20261102090000_phase05f_g7_email_delivery additively creates four tables, FK/unique/index/lease/state bounds. All prior applied SQL is unchanged. Fresh verified dev/test backups preceded migration; both DBs now have 36 matching active applied migrations and no unresolved failures. See G7_VALIDATION_STATUS.md and external validation/2026-11-02-g7/.

Next implementation: G8 FCM/push/rich campaign contracts. G5–G7 runtime validation waits for G12; G2 email acceptance also waits for controlled provider proof and complete account action flow. G11 deployment/provider/restore verification remains separate.
