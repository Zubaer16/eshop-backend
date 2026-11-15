# Backend release operations and acceptance

## Request-triggered action processing - 2026-11-15

The owner clarified that ordinary customer and Admin actions should begin their associated processing on Hobby without waiting for a scheduled tick. The existing operational workers are reused through request-lifecycle background attempts.

A query-only Prisma observer collects outbox identifiers and touched inventory/media resources inside an AsyncLocalStorage scope for each HTTP request. The global interceptor starts waitUntil processing after the handler settles. Event rows are re-read after their issuing transactions. A rolled-back event ID resolves to no work. Concurrent requests have independent pending/visited sets. Follow-on events produced by the background operation remain in the same lifecycle and duplicate identifiers are deduplicated.

Committed actions now initiate in-app notifications, configured transactional email and push delivery, due approved campaign fanout, authorized refund execution, payment cancellation for closed orders, activated image rendition processing and explicit media deletion retries. Refund execution starts before notification email delivery. Notification, email and push subscribers process independently. All dispatch/lease-recovery queries accept a resource/event filter. Explicit exhausted in-app receipt retry invokes its DB-only subscriber.

PostgreSQL-triggered low-stock events are located for the touched balance within the current request window. Media deletion retains namespace, reference, lease and availableAt guards. Campaign fanout retains approval, scheduledAt, consent and retry guards. Provider mode, allowlists, Stripe TEST/showcase gates, existing financial verification and uncertain-submission review states govern execution.

Reservation shortage recovery first attempts the ordinary reserve transaction. On a structured stock shortage it expires related product holds and eligible unpaid allocations using the existing atomic transition/fencing logic, then retries stock allocation once under normal balance locks. The scoped expiry queries preserve active-payment, hosted-session and signed-success fences. Stock-ready checkouts follow their normal reserve path. The checkout regression verifies that another product's expired hold remains outside the touched product scope.

The guarded checkout regression command now includes the immediate-actions DB tests. The same existing REST entry points and durable tables serve the feature. waitUntil processing uses the deployment function execution budget. Durable failures and time-based/future maintenance retain the existing recovery mechanisms.

### Executed validation and deployment

Type checking, lint, production compilation and whitespace checks passed. All 375 unit tests passed across 72 suites. All 87 isolated PostgreSQL API regressions passed in the final complete run with zero retries/skips. The focused checkout run passed all nine tests and the database-free API/OpenAPI smoke suite passed all 13 tests. The new HTTP regressions prove post-commit in-app delivery without draining an unrelated event, PostgreSQL-triggered low-stock notification processing and scoped expiry recovery of stock held by another customer.

Production deployment dpl_DE3n97R4q7U4CQ2CUMYA8LRU3Hxw reached READY. The eshop-backend-mu.vercel.app Production alias points to eshop-backend-5ry3y161k-zubaerahmed7690-gmailcoms-projects.vercel.app. Hosted health, categories and product reads returned HTTP 200. The unauthenticated notifications endpoint returned HTTP 401. Financial/push provider execution coverage used isolated database fixtures and mocked provider adapters. The earlier live SMTP acceptance evidence is retained in the account-email section below.

The validated working tree was deployed directly with Vercel CLI. Source commit/push remains pending. The implementation and validation evidence are recorded in backend operations documentation and all three master documents.

## Immediate account email delivery - 2026-11-15

The owner approved request-triggered email delivery and withdrew the proposed GitHub Actions scheduler. The temporary workflow was removed before activation. Verification and password-reset issuance now return their committed outbox event ID internally and start a request-scoped background attempt through @vercel/functions waitUntil. Public accepted responses retain their existing shape. Resend cooldowns, account eligibility, encryption, recipient binding and token expiry remain enforced through existing issuance and message preparation.

EmailDeliveryModule owns the existing queue, dispatcher, SMTP provider and immediate processor. AuthModule imports this delivery-only module. EmailModule composes authenticated administration with that delivery module. The module graph resolves without a circular AuthModule/EmailModule dependency.

Queue and dispatcher accept an optional event filter. The immediate path limits processing to the newly issued event and reuses durable receipts, per-delivery database claims, bounded retries and uncertain-submission review states. Transaction failure and silent cooldown paths produce no immediate attempt. Disabled delivery mode skips background processing. Lifecycle processing errors are logged with a generic message and durable state supports recovery through existing operational workers.

Executed local validation passed type checking, lint, production compilation, 355 unit tests and 13 API smoke tests. New regressions cover post-commit scheduling, cooldown suppression, transaction failure, nonblocking request lifecycle registration, disabled mode, failure containment and exact event filtering of queue candidates, dispatch candidates and expired leases.

### Hosted validation

Production deployment dpl_4QLJzByuH1hzTx2riPCzKF8oh6AQ reached READY and the eshop-backend-mu.vercel.app alias points to it. Public health, categories and product reads returned HTTP 200. A password-reset request for the single configured controlled recipient returned HTTP 202 in 2729ms. The new event planning receipt completed and its delivery reached SMTP ACCEPTED 7814ms after event creation, with no failure code. This establishes request-triggered provider submission. Inbox receipt remains user-observable.

During live diagnostics, a session-level read-only setting persisted on a pooled PostgreSQL connection and temporarily blocked the authentication limiter with HTTP 503. The session default was reset to off. The subsequent request and delivery completed successfully. Subsequent diagnostic queries used SELECT statements. Timestamp observation was corrected for timezone-less PostgreSQL values by formatting UTC in SQL.

Source changes remain available in the working tree for review and commit/push. The current live deployment was created directly from the validated local source using Vercel CLI. The proposed GitHub workflow was removed before any scheduler activation.

## Production jobs configuration restoration - 2026-11-15

The owner authorized reconstructing and replacing the hidden jobs configuration. The original JOBS_ALLOWED_LANES value was stored as Sensitive in Vercel Production. Its empty CLI export represented redaction and did not establish an empty deployed value. The prior hidden list could not be retrieved. The replacement uses all 16 supported lanes from src/jobs/jobs.policy.ts, checked against the compiled policy and jobsConfiguration validator.

```dotenv
JOBS_ALLOWED_LANES=checkout.reservations,checkout.orders,payments.reconcile,payments.cancel,refunds.execute,media.reconcile,media.renditions,media.cleanup,notifications.dispatch,email.queue,email.dispatch,push.campaigns,push.queue,push.dispatch,devices.expire,jobs.retention
```

JOBS_ALLOWED_LANES was recreated as a readable encrypted configuration entry scoped to Production. Vercel prevents converting an existing Sensitive entry directly. Production export/readback verified the exact 16-lane value, JOBS_CRON_ENABLED=true and matching configured cron bearer secrets. This list contains operational lane names.

The existing Production version at commit 9dfa10714bea94b5e93dd53456bf21906de409b4 was redeployed using the updated project environment. Deployment dpl_5BM5BEpwoj6UAgsUtTrvnpmEt9L9 reached READY and the eshop-backend-mu.vercel.app alias points to it. GET /v1/health and GET /v1/categories both returned HTTP 200 after promotion.

Automatic email processing remains pending scheduler configuration. The deployed version has no configured Vercel cron schedule. Lane configuration and deployment readiness alone do not establish email submission or mailbox delivery. Earlier read-only inspection found four expired verification events, zero email deliveries/receipts and no email job runs. SMTP authentication/connection verification passed with the matching local/Production provider configuration.

This is an operational handoff, **not a release acceptance certificate**. There is no automatic production deployment, migration, provider replay, cron enablement, or secret material in this repository cleanup.

## Source and migration safety

Use Node >=24.11, check the live working-tree state and compare against the root-relative cleanup manifest before any overlay application. Inspect both dev and isolated localhost test databases separately. Read-only migration identity/hash auditing is available:

```powershell
node -r dotenv/config scripts/db-migration-audit.cjs --expect-db kookaburra-api-dev --expect-minimum 40
node -r dotenv/config scripts/db-migration-audit.cjs --expect-db kookaburra_api_test --expect-minimum 40 --connection-env API_TEST_DATABASE_URL
```

The second command requires `API_TEST_DATABASE_URL` to resolve to local database `kookaburra_api_test`. Audit failures and source-pending migration reports are not approvals to deploy. **40 migration source directories** were present in the uploaded baseline; actual applied database history must be established from the owner's environment. Take separate fresh PostgreSQL custom-format backups, verify SHA-256 and `pg_restore --list`, and perform a disposable-database restore rehearsal using owner-reviewed procedures. The source ZIP **does not include the older PowerShell backup/restore helper scripts** mentioned in historical notes; do not rely on those paths until independently supplied and inspected. Do not edit migration history or `migrate reset` protected databases.

## Static checks and release regression

```powershell
npm ci
npm run check:static
npm run jobs:verify:source
npm run alignment:audit
# ONLY when ready to perform complete local release acceptance (Node 24 + isolated test DB):
npm run release:local
npm run release:openapi
npm run release:openapi:check
npm run release:tooling:test
npm run release:gate
```

The local runner executes `check` (includes Jest and Nest E2E), isolated API smoke/DB/security, Chromium Swagger suites, alignment and source audits, OpenAPI export/check, and tooling tests. It records steps/hashes/status in ignored `validation/release-local/receipt.json`; **retain redacted raw logs separately**. The OpenAPI contract is generated into ignored `artifacts/release/openapi.json` from the same normalized Nest Swagger app, not from a separate server, and is not a client SDK.

## Latest local verification — 2026-11-07

The local release runner completed all 12 steps with exit code zero, from 12:37 to 13:10 Asia/Dhaka. The 511-file source fingerprint matched at run completion. The temporary `release` alias was subsequently removed at the owner's request; existing `release:*` scripts and suite implementations remain unchanged. That package-script edit changes the fingerprint, so the receipt remains historical until the next complete `npm run release:local` run. Results: 307 unit, 13 Nest E2E, 57 API smoke, 83 real-DB, 69 security, 37 Chromium, 3 alignment and 3 release-tooling tests passed. Generated OpenAPI has 154 paths and 198 operations. No tests were skipped or weakened for this run.

Separate dev/test databases retained 40 matching applied migration checksums, with no pending migrations. Fresh custom backups, hashes and archive-list inspection preceded the run. Evidence: ignored `validation/release-review-20261107/`, with the prior 5 November receipt preserved separately. `npm run release:gate` requires a fresh source-matching local receipt after the alias removal, and external acceptance also remains blocked because `validation/release-external/evidence.json` is absent. No external provider, staging deployment or restore acceptance is inferred from these local tests.

## External evidence and sign-off

Inspect and document eight evidence categories: controlled SMTP verify/reset, controlled FCM, Stripe TEST settlement/refund/reconciliation, media-provider lifecycle, scheduler recovery, disposable DB restore, staging HTTPS deployment/rollback, and secrets/dependency audit. The example (pending by default) is `contracts/release-external-evidence.example.json`. Store private reviewed redacted evidence in `validation/release-external/` with SHA-256 and reviewer data. `npm run release:gate` checks source-bound local receipts and the eight categories; even when it returns `EVIDENCE_COMPLETE_OWNER_REVIEW_REQUIRED`, owner review of real logs is still mandatory. Provider acceptance does not prove device display/mailbox delivery. CI cannot prove external provider, deployment or restore acceptance.

## Safe read-only production preflight

```powershell
node -r dotenv/config scripts/release-preflight.cjs --target=vps
# or --target=vercel
# Read-only by default. Requires explicit expected DB identity.
node -r dotenv/config scripts/prune-auth-abuse-buckets.cjs --expect-db=kookaburra-api-dev
# HTTPS staging smoke exercises endpoints; DO NOT invoke on production unintentionally:
# node scripts/release-https-smoke.cjs --base=https://staging-api.example
```

Keep scheduling, SMTP/FCM and Stripe TEST capabilities off until separately authorized. The preflight rejects unsafe local `.env` by default; `ACK_LOCAL_ENV_FILE_FOR_RELEASE_PREFLIGHT=true` is an explicit local-file acknowledgement for reviewed non-production use, **not** a bypass of other checks. Review ingress/CORS, trusted proxy CIDRs, token/privacy boundaries, media storage persistence and reversible deployment strategy before staging. The migration and HMAC key domain-separator identifiers intentionally retain their original historical names for data and security continuity.

## Compatibility note for this cleanup

Old internal `g12:*` npm task names have been replaced with `release:*`, and phase-prefixed maintenance scripts/test files have functional names. Old validation receipts are not compatible with renamed source/step fingerprints: regenerate evidence through the full runner. This does **not** rename HTTP routes, Prisma history, provider event contracts or database structures. Phase-specific `.md` documents and the source handoff manifest are stored separately in the accompanying historical-docs archive.
