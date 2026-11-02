# G3/05B-5 local validation — 2026-11-02

This batch validates the existing Store Operations/delivery-zone implementation in the current Windows working tree. Existing uncommitted owner changes are preserved. No new migration or database reset was performed.

## Evidence and checks

- Runtime: Node 24.21.0, Prisma 7.9.1.
- Direct local PostgreSQL identity check: `kookaburra-api-dev` and isolated `kookaburra_api_test`, port 5432. Each has 31 finished migrations; every stored migration checksum matches source SQL.
- Both databases backed up in custom format before DB-writing tests. `pg_restore --list` succeeded and SHA-256 sidecars are retained. This is archive verification, not a restore rehearsal.
- `npm run check`: PASS, 197 unit tests / 44 suites, 13 Nest E2E; Prisma generate/validate, typecheck, Swagger syntax, lint, build.
- `node scripts/run-api-tests.cjs smoke`: 50 PASS.
- `node scripts/run-api-tests.cjs db`: 50 PASS, including new service-specific free-shipping and concurrent zone-edit assertions.
- `node scripts/run-api-tests.cjs security`: 52 PASS.
- `node scripts/run-api-tests.cjs visual-store-gate`: 1 PASS.
- `node scripts/run-api-tests.cjs visual-db`: full Swagger Chromium regression 29 PASS (19.4 minutes), 0 failed, no retries. This is the mode used by `npm run test:api:visual:all`, executed after the successful build.
- `npm run alignment:audit` with both actual frontend directories: 6 MATCH / 10 ADAPTER / 1 PLANNED / 0 REVIEW_REQUIRED. `npm run alignment:test`: 2 PASS, 0 skipped. This is source inspection, not live frontend acceptance.

Evidence directory (external, owner-held): `C:\Users\zubaer.ahmed\Desktop\KOOKABURRA-V2-MASTER-DOCS\validation\2026-11-02-g3`. Full check, API, security, browser and alignment logs are retained separately from the master documents.

## Changes in this batch

- Added real-DB assertions that a standard free-shipping threshold does not erase express fees, and only one concurrent write can advance the same zone revision.
- Corrected stale alignment audit wording claiming orders/payments were planned; added source checks for implemented order/payment/delivery-zone controllers. Coupons remain G4 planned scope.
- Updated the three external master documents for direct local editing and evidence-based progress. No patch archive is required under the owner's 2026-11-02 workflow decision.

## Remaining release boundaries

The owner explicitly approved the current G3 v1 boundaries and limited G1 scope on 2026-11-02. With full local regression now PASS, **G1 and G3 are LOCALLY ACCEPTED for that approved v1 scope**. G0 returns behavior is also locally revalidated with current logs/backups; its original missing pre-migration backup exception remains historical and cannot be retroactively erased.

The API supports guest cart followed by authenticated checkout; country/currency tax lanes; optional standard/express zones; origin metadata with deployment-managed CORS; presentation currency without FX; and a reserved order prefix without generated order numbers. G1 retains same-SKU replacement, one shipment per order and authenticated owned-UUID tracking. Owner-approved post-v1 backlog: cross-SKU financial exchange, partial shipment and public tracking. Paid refunds and unpaid cancellation stay separate; mixed recovery retains conservative manual review.

**G2 stays OPEN for G7 actual verification/recovery email delivery**, although current account/token/session APIs passed local regressions. Browser integration, external Stripe/SMTP/FCM delivery, deployment-origin smoke and restore rehearsal remain separate work. G12 is NOT ACCEPTED. No production acceptance is claimed.

## Next implementation

G4 promotions/coupons, using both current browser repositories and backend-authoritative integer pricing, atomic usage limits, safe reservation/order snapshots and unchanged payment/refund invariants. No need to recreate G1/G3 or reapply historical patches. Complete G2 delivery acceptance when G7 is implemented.
