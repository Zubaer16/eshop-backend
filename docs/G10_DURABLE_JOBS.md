# G10 / Phase 05I — Durable background job orchestration

**Scope:** Backend only. Additive single-tenant NestJS/PostgreSQL coordinator around the already-implemented G0–G9 domain workers. **Source candidate / full validation pending**; this document is not an executed acceptance certificate.

## Operation model

- `src/jobs/jobs.service.ts` dispatches **one small, bounded domain batch per lane**. No new payment, refund, email or push send semantics. Existing domain DB guards, provider verification, idempotency keys and review states remain authoritative.
- **16 explicit allowlisted lanes:** `checkout.reservations`, `checkout.orders`, `payments.reconcile`, `payments.cancel`, `refunds.execute`, `media.reconcile`, `media.renditions`, `media.cleanup`, `notifications.dispatch`, `email.queue`, `email.dispatch`, `push.campaigns`, `push.queue`, `push.dispatch`, `devices.expire`, `jobs.retention`.
- A G10 PostgreSQL scheduler row is atomically claimed using a **unique lease UUID and database clock**. Leases have 15-minute expiry, 30-second best-effort heartbeat, and release/cooldown on completion. Another invoker skips an owned lease; an expired lease is recoverable. A late invoker cannot change another owner's schedule (token fencing).
- Trigger invocation chooses at most **three due lanes**; explicit `--lane` chooses one. Each lane has a fixed cadence and bounded retry cooldown 30–900 seconds. Runs persist sanitized name/trigger/status/counts, never payloads/provider errors. A run stranded by lost lease becomes `ABANDONED`; this is _not_ permission to resend an uncertain provider submission.
- `devices.expire` marks a bounded set of expired registrations `EXPIRED` and clears ciphertext **without removing historical deliveries**. `jobs.retention` removes at most 100 **successful scheduler-only run records** older than 90 days. Failed/abandoned run metadata, payment facts, audit events, outbox events, subscriber receipts and email/push submission history are never purged by this lane.
- Event planning uses the established G6/G7/G8 **independent receipts**. Native dispatchers own their bounded backoff. SMTP/FCM `PROCESSING` leases that expire are handled by the **existing explicit `REQUIRES_REVIEW` logic**. Never auto-replay these, accepted sends, failed refunds, or uncertain Stripe operations merely because a scheduler lease expired.
- A large approved push campaign progresses through its existing **cursor-based fanout**, at most 40 customers per run and 10 campaigns per batch. This does not claim approval-time audience snapshots.

## API and authorizations

- `GET /v1/admin/jobs/status`: current counts by safe status and schedule metadata. OWNER JWT only.
- `GET /v1/admin/jobs/runs?limit=1..100`: bounded scheduler run history; no provider payload.
- `GET /v1/admin/jobs/failures`: at most 25 safe identifiers/statuses per failure domain. It is an indicative slice, **not an exhaustive export**. Never includes email addresses, recipient hashes, ciphertext, message bodies or tokens.
- `POST /v1/admin/jobs/retry-notification/:id`: OWNER-audited, transactional reset **only** for a G6 in-app receipt that is `FAILED` with `attempts >= 10`. DB-only notification upsert is deduplicated; no retries of SMTP, push, refunds or payment are exposed.
- `GET /v1/internal/jobs/tick`: **excluded from Swagger**. Requires `JOBS_CRON_ENABLED=true`, explicit lane allowlist and exact `Authorization: Bearer <JOBS_CRON_SECRET>`. `Cache-Control: no-store`. Vercel's `CRON_SECRET` must be set to the same secret if Vercel cron supplies it. Without config it returns 503. Caller secret is SHA-256 compared with a fixed-length timing-safe comparison. Do not log it or put it in the URL.

## Execution, scheduler and failure boundaries

`JOBS_CRON_ENABLED=false` and an empty `JOBS_ALLOWED_LANES` by default, so **new uploads do not start any job**. Operator chooses lanes after provider-specific readiness checks. `JOBS_CRON_SECRET` is deployment-owned 48+ characters, independent of JWT and provider secrets.

After an approved migration and successful static checks, preview (read only):

```powershell
npm run jobs:tick
npm run jobs:tick -- --lane notifications.dispatch
```

Explicit single bounded apply (requires `JOBS_ALLOWED_LANES`):

```powershell
npm run jobs:tick -- --apply --lane notifications.dispatch
```

VPS/Docker worker **only when commissioned** (process supervisor must restart it, shut it down cleanly and alert on failures):

```powershell
node -r dotenv/config dist/tools/jobs-worker.js --apply --loop --interval 30
```

Vercel cron configuration is a **deployment step**, not automatically enabled by this patch: adapt route mapping to the actual Vercel Nest runtime, provision `CRON_SECRET`/`JOBS_CRON_SECRET` and `JOBS_CRON_ENABLED=true`, and point a properly scheduled cron at `/v1/internal/jobs/tick`. Confirm that serverless function runtime and resource limits can complete the chosen bounded lanes. Avoid scheduling very slow provider lanes on time-limited serverless functions; use VPS worker instead. External Vercel/VPS deployment smoke remains **G11**.

## Retry and recovery rules

1. Inspect OWNER `status`/`failures`/`runs` and the authoritative domain-specific payment/refund/email/push reconciliation screens. Investigate `ABANDONED` vs `REQUIRES_REVIEW` distinctly.
2. Check deployment secrets, DB target, provider/test flags and native job status before enabling a lane. G10 config **does not enable** disabled TEST Stripe, SMTP or FCM providers.
3. Only existing safe provider-domain recovery operations may decide external retries. No generic G10 “replay all dead letters” endpoint exists; uncertain external acceptances are **never** blindly resubmitted.
4. G6 in-app receipt exhaustion can be operator-reset with the new guarded API; the re-run remains receipt-based and duplicate-resistant. Media failed deletion has its existing guarded media retry endpoint; no direct G10 bulk retry.
5. `media.reconcile` is retention-aware scheduling/repair, while `media.cleanup` may invoke storage provider deletion after domain checks. Keep provider config, media namespace, and recovery guidance current.
6. Operational telemetry retention **does not constitute backup/recovery policy**. G11 owns restore rehearsal and production retention/legal policy; G12 owns full deferred tests.

## DB and release boundary

Migration `20261104160000_phase05i_g10_job_schedule` adds only `job_schedules`, `job_runs` and indexes. **Never edit historical applied migration SQL.** Identify both DBs, confirm all existing applied checksums, create and inspect independent custom-format `pg_dump` backups first, then use `prisma migrate deploy` under owner supervision. Do not run migration against an unverified URL. This upload does not prove migration execution, PostgreSQL safety, SMTP/FCM/Stripe external acceptance, Vercel routing or runtime performance.

## Deferred acceptance (G12)

Added source tests: policy, scheduler isolation/lease, API security and OpenAPI, DB metadata contract and Chromium Swagger. **Not executed** under the 2026-11-02 owner decision. Acceptance needs real local DB concurrency/crash/recovery, due-time scheduling, stale leases, rate/size, owner auth, retained financial ledger invariants, race/fanout and serverless/VPS scenarios, plus G11 deployment checks. The preexisting `activeNotificationStaff()` 1000-user fail-visible cap is retained; its expansion to a durable paged fanout would require separate data-model and performance verification before claiming >1000 staff support.
