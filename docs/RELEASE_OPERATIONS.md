# Backend release operations and acceptance

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
