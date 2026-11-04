# Delivery roadmap (verified scope, not marketing completion)

> **2026-11-02 orientation:** The checkboxes below are historical phase notes, not the current gate ledger. The owner-held `KOOKABURRA-V2-MASTER-DOCS/03_BACKEND_ROADMAP_STATUS.md` controls the bounded G0–G12 plan. Latest local acceptance: G4 in `G4_VALIDATION_RESULTS.md` and `G4_PROMOTIONS_COUPONS.md`; earlier G3 evidence remains in `PHASE05B5_LOCAL_VALIDATION.md`. G1 approved scope/G2 email dependency are in `G1_G2_CONTRACT_REVIEW.md`. G5 content/merchandising is IMPLEMENTED / FULL VALIDATION PENDING; see G5_MERCHANDISING.md and G5_VALIDATION_STATUS.md. From G5 onward the owner defers all automated test execution until G12; per batch run check:static, source audit and required guarded migrations. G6 notifications is now IMPLEMENTED / FULL VALIDATION PENDING; see G6_NOTIFICATIONS.md and G6_VALIDATION_STATUS.md. G7 email queue/SMTP/templates/history is IMPLEMENTED / FULL VALIDATION PENDING; see G7_EMAIL_DELIVERY.md and G7_VALIDATION_STATUS.md. SMTP remains disabled/unverified, so G2 email acceptance is still open. G8 FCM/device/rich campaign implementation is now IMPLEMENTED / FULL VALIDATION PENDING; see G8_PUSH_CAMPAIGNS.md and G8_VALIDATION_STATUS.md. FCM remains disabled/unverified and web service-worker integration remains pending. G9 reporting/activity/CSV is IMPLEMENTED / FULL VALIDATION PENDING; see G9_REPORTING_ACTIVITY.md and G9_VALIDATION_STATUS.md. Static/build PASS; dev/test each have 38 matching applied migrations. Runtime tests remain deferred until G12. Next implementation is G10 hardening. Source is edited directly; no overlay archive is required in the current local workflow.

## Phase 01 — Bootstrap and HTTP foundation

- [x] NestJS dev server and HTTP 200 health verified by user screenshot.
- [x] Environment/CORS fixes authored; full final `npm run check` output not received.
- [ ] Vercel preview deployment smoke-test.
- [ ] Dependency audit and fixes.

## Phase 02 — This overlay: persistence and identity foundation

- [x] HTTP request completion logs (status, duration, request ID; no secrets).
- [x] Swagger module-tagged customer/admin/system endpoints.
- [x] PostgreSQL Prisma schema + initial SQL migration authored.
- [x] Customer register/login/me, access JWT, rotate/revoke opaque refresh sessions.
- [x] Staff admin login and protected me; local first owner bootstrap (no public admin sign-up).
- [x] Canonical product/category/variant identity, outbox/idempotency schema foundations.
- [ ] Live Postgres migration, actual DB integration tests, complete `npm run check`, audit/production verification (requires user's environment).
- [ ] Email verification/password reset, distributed brute force protection, granular staff permissions.

## Phase 03 — Catalog, inventory, media

- [x] Catalog CRUD/read; SKU-level atomic inventory (earlier user-validated phases).
- [x] Phase 03C-1 Cloudinary direct-signed upload/verification and provider interface; namespace isolation (requires Windows/local test + real Cloudinary verification).
- [ ] S3/R2/VPS media adapters and provider switching tests.
- [x] DB-backed ordered galleries, reference-aware archive/replace, 7-day deletion jobs, retry/recovery worker (implementation pending local E2E validation).
- [ ] Provider-specific rendition processing, operational cron/worker deployment verification and CDN cache purge timing acceptance.

## Phase 04 — Checkout, payment, orders

- [x] Phase 04A-1/04A-2: customer/guest carts, live catalog quote and secure merge (user-reported tests accepted).
- [x] Phase 04B-1 (local Codex validation accepted: 181 test executions): JWT customer checkout estimate, configurable owner country/currency shipping and tax estimation with explicit no-fallback policy.
- [x] Phase 04B-2: guarded stock holds, expiry/release, adjustment guards; user reported 186/186 local validation executions PASS.
- [ ] Address-specific jurisdiction tax, actual shipping services and a finalized payable checkout quote.
- [x] Phase 04C-1 implementation: order snapshots, time-bounded unpaid allocation, cancellation/expiry with transactional release (Windows acceptance pending).
- [ ] Phase 04C-2 Stripe TEST mode, webhook verification/idempotency and paid stock consumption.

## Phase 05 — Frontend integration and rollout

- [ ] OpenAPI-generated clients for Admin/Storefront/Flutter.
- [ ] Remove fixtures and verify real workflows against isolated DB.
- [ ] E2E/security/load/backup/recovery tests, Vercel and VPS deploy tests.

- [ ] Phase 04C-2A TEST-mode payment preparation + raw signed webhook receipts implemented; real Windows acceptance pending. **Not payable**; no card confirmation/capture, order PAID, physical deduction or payout.
- [ ] Phase 04C-2B: settlement/reconciliation, provider cancellation, payment expiry coordination, charge/refund, stock finalization.

- [ ] Phase 04C-2B2A: operator-only Stripe TEST provider cancellation + durable retry/review worker; implementation authored, Windows PostgreSQL/Chromium acceptance pending. No new checkout/capture/refund endpoint.

### Phase 04C-2B2B (pending local acceptance)

TEST-only fixed-card confirm/capture with order-expiry fencing; receipt-driven settlement unchanged. Provider refunds, real customer confirmation/3DS and recovery automation remain deferred. See `docs/PHASE04C2B2B_TEST_AUTHORIZE_CAPTURE.md`.

## Phase 04D-2A — Returns and controlled restocking

- [x] Implementation authored: customer return requests, admin inspection, idempotent physical restocking, append-only movement/audit/outbox.
- [ ] Node 24/PostgreSQL/Chromium acceptance pending. Refunds and stock returns deliberately independent.
