# G12 — Backend Release Candidate exit (source handoff 2026-11-05)

**Scope:** Final, bounded v1 backend acceptance. Existing NestJS/Prisma modules and G5–G11 test sources are preserved. This patch adds the release evidence runner, canonical OpenAPI contract export, strict evidence-gate tooling and an isolated CI regression workflow. It adds **no database migration, no new payment/refund logic and no `.ps1` files**.

## Short Windows invocation

Run in the Backend directory with Node 24 and isolated `API_TEST_DATABASE_URL` configured for local database `kookaburra_api_test`. Existing dev/test database identities, applied migration checksums and separate verified backups remain prerequisites (use `scripts/g11-db-migration-audit.cjs` and the previously provided local backup procedure). Never use live/production URLs for G12 tests.

```powershell
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run db:status
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:all
npm run jobs:verify:source
npm run alignment:audit
npm run alignment:test
npm run g12:openapi
npm run g12:openapi:check
npm run g12:tooling:test
npm run g12:gate
```

**Simplified full local suite:** `npm run g12:local` runs `check`, API smoke, guarded isolated test DB migration, API DB/security, full Chromium, alignment, G10 job wiring, OpenAPI and G12 tooling checks serially. It intentionally requires Node 24 and `.env.api-test` or `API_TEST_DATABASE_URL`. It records only source hashes, step names, exit codes and timestamps to ignored `validation/g12-local/receipt.json`. **Terminal output is not captured by the receipt**; retain actual full logs separately in a private location. The script stops on a failing suite, and rerun is required after a source change.

**No new SQL:** Existing 40 migrations through `20261105130000_phase05j_g11_auth_abuse_limit` are untouched. Avoid `prisma migrate dev/reset` on real data. Migrate only after checking both DB identities/checksums and verified separate backups. `npm run test:api:db:deploy` uses the guarded localhost-only `kookaburra_api_test` database. `npm run db:deploy` operates on the configured dev DB and must never be pointed at the test/production DB unintentionally.

## Canonical OpenAPI contract handoff

`npm run g12:openapi` builds, bootstraps Nest **without HTTP listening or database connection**, captures the same normalized document used by Swagger UI, checks representative required `/v1` endpoints and both authentication schemes, and saves `artifacts/g12/openapi.json` (ignored, local). It generates a _contract for client generation_, **not** a generated TypeScript or Flutter SDK. Frontend teams can generate clients from this versioned JSON after contract review. Existing routes remain `/v1`, not historical `/api/v1`. Structural checks are not proof that RBAC/runtime behavior is correct.

## Evidence to exit G12

- Full `check` (unit + Nest E2E), isolated API smoke/DB/security, all Chromium Swagger tests, G10 wiring, cross-repo alignment, OpenAPI check and G12 tooling tests must all pass with **zero skipped relevant cases** and reviewed logs.
- Both dev and test DB IDs and **40** migration checksums must be checked against source; fresh separately verified backups (SHA-256/archive-list) and disposable-DB restore evidence retained.
- G2 verification/password reset requires controlled _actual_ SMTP acceptance and authenticated one-time action flow; G8 actual controlled FCM, Stripe TEST settlement/refund/cancel/reconcile, Cloudinary/S3/disk media switch/delete, G10 cron/lease/recovery, secret/dependency audit, HTTPS staging/deployment and rollback evidence remain G11 release prerequisites. Provider submission acceptance does not mean mailbox delivery or push display.
- Place redacted external logs in `validation/g12-external/` and make a private `evidence.json` with exact categories from `contracts/g12-external-evidence.example.json`, each including the log relative path, SHA-256, reviewer, review timestamp and `result: "PASS"` **only after verifying it**. The example is intentionally incomplete and `PENDING`.
- `npm run g12:gate` checks source-bound local receipts and all 8 external evidence categories. Even a successful gate emits `EVIDENCE_COMPLETE_OWNER_REVIEW_REQUIRED`, **not** automatic RC PASS; a human owner must review raw logs and explicitly accept the Backend RC. No claim of external evidence integrity beyond hash matching.

## CI and source constraints

`.github/workflows/g12-backend-ci.yml` runs local suites against disposable CI PostgreSQL, including Chromium under Xvfb; it never contacts real SMTP, FCM, Stripe TEST or deployed services and cannot accept the Backend RC. Alignment against Admin/Storefront repositories remains an **owner local cross-repo gate**, not a passing CI condition when those repositories are missing.

Open items: any failures found by the full G12 suites, prior G7 dependency-audit findings, provider/restore/deployment evidence and web UI adapters. All three owner-held Markdown documents are provided separately outside the repository.
