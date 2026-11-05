# G11 owner Windows PowerShell handoff — source, DB safety, validation (2026-11-05)

The `.tar.gz` is **not** the repository. It contains changed/new root-relative Backend files and a manifest-hash guarded installer. It must first be extracted to a staging directory **outside** the repo. These commands are intentionally separate so there is no silent overwrite or migration. Replace archive locations as needed; never paste private database URLs into a shared log. Commands presume the owner-reported G10 is truly installed and DB migrations applied; verify independently first.

## A. Safe extraction/preview/install

```powershell
$backend = Join-Path $env:USERPROFILE 'Desktop\git\kookaburra-backend'
$archive = Join-Path $env:USERPROFILE 'Downloads\KOOKABURRA_G11_PHASE05J_BACKEND_OVERLAY_20261105.tar.gz'
$stage = Join-Path $env:TEMP ('kookaburra-g11-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
tar -tzf $archive                       # inspect file list; no extraction yet
tar -xzf $archive -C $stage             # ONLY staging, not Backend
Get-FileHash -Algorithm SHA256 $archive
Set-Location $backend
git status --short                        # review dirty files; do not reset them
& (Join-Path $stage 'G11_OVERLAY_INSTALL.ps1') -BackendRoot $backend -OverlayRoot $stage
# The line above MUST say PRECHECK_MATCH. If any mismatch: STOP, reconcile live source.
$sourceBackup = Join-Path (Split-Path $backend) ('g11-source-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
& (Join-Path $stage 'G11_OVERLAY_INSTALL.ps1') -BackendRoot $backend -OverlayRoot $stage -Apply -BackupRoot $sourceBackup
# The installer performs no DB, npm or worker operations.
```

If PowerShell blocks running scripts, review/sign/use an approved local script execution policy; do not bypass organization security controls. Installer checks exact SHA256 before overwrite; local G10 fixes that changed touched files require a new reviewed patch, not `-Force`.

## B. Node 24 static checks (NO automated tests, per G12 deferral)

```powershell
Set-Location $backend
node --version                           # Node 24.11+ (project .nvmrc = 24)
npm ci
npm run db:generate
npm run db:validate
npm run typecheck
npm run typecheck:swagger:syntax
npm run lint
npm run build
npm run jobs:verify:source
npm run alignment:audit                 # Admin/Storefront folders must be siblings
# Or run the existing combined static command (still NO automated tests):
npm run check:static
# DO NOT run npm run check (it executes Jest and Nest E2E tests).
```

## C. DB identity/checksum and independent verified backups, BEFORE any G11 migration

Use separate `kookaburra-api-dev` and `kookaburra_api_test` databases, not aliases for the same DB. `DATABASE_URL`/`DIRECT_URL` stay private; `API_TEST_DATABASE_URL` belongs in ignored `.env.api-test`. `node -r dotenv/config` loads .env by default; in a PowerShell session with env variables, it prefers the existing environment. Audit script supports an explicit safe test variable. _After installation but before migration_, a verified G10 DB should show **39 applied migrations** and **only the new G11 migration source pending**. Its read-only audit exit code `3` means source migration(s) pending; inspect JSON for the exact single expected G11 filename. Exit code `1/2` is a STOP.

```powershell
Set-Location $backend
$env:DOTENV_CONFIG_PATH = Join-Path $backend '.env'
node -r dotenv/config scripts/g11-db-migration-audit.cjs --expect-db kookaburra-api-dev --expect-minimum 39
# Exit code 3 is expected *only if* JSON lists exactly 20261105130000_phase05j_g11_auth_abuse_limit as pending.
# Restore the default exit code with a fresh command, never hide a mismatch.
$env:DOTENV_CONFIG_PATH = Join-Path $backend '.env.api-test'
node -r dotenv/config scripts/g11-db-migration-audit.cjs --expect-db kookaburra_api_test --expect-minimum 39 --connection-env API_TEST_DATABASE_URL
# Again inspect the JSON and expected pending migration explicitly.
Remove-Item Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue

# Configure PGHOST/PGPORT/PGUSER/PGPASSWORD or .pgpass locally; do not write passwords to logs.
$backupRoot = Join-Path (Split-Path $backend) ('g11-db-backups-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
& (Join-Path $backend 'scripts/g11-verified-db-backup.ps1') -Database 'kookaburra-api-dev' -OutputDirectory (Join-Path $backupRoot 'dev')
& (Join-Path $backend 'scripts/g11-verified-db-backup.ps1') -Database 'kookaburra_api_test' -OutputDirectory (Join-Path $backupRoot 'test')
# Inspect both .dump, .dump.sha256, .dump.list.txt; store archives securely outside repos.
```

Caution: if the PowerShell process already has `DIRECT_URL` or `DATABASE_URL` set, confirm they refer to the desired DB. For the test audit, `--connection-env API_TEST_DATABASE_URL` forces the exact test URL. Never conflate dev/test identities or use `migrate reset`, `db push`, `migrate dev` on protected databases.

## D. Review and apply the one additive G11 migration

```powershell
Set-Location $backend
Get-Content prisma/migrations/20261105130000_phase05j_g11_auth_abuse_limit/migration.sql
$env:DOTENV_CONFIG_PATH = Join-Path $backend '.env'
npm run db:status
npm run db:deploy                      # DEV only, only after independent dev backup
node -r dotenv/config scripts/g11-db-migration-audit.cjs --expect-db kookaburra-api-dev --expect-minimum 40
# TEST migration: existing guarded runner refuses non-local / wrong-name test DB.
npm run test:api:db:deploy
$env:DOTENV_CONFIG_PATH = Join-Path $backend '.env.api-test'
node -r dotenv/config scripts/g11-db-migration-audit.cjs --expect-db kookaburra_api_test --expect-minimum 40 --connection-env API_TEST_DATABASE_URL
Remove-Item Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue
```

The post-migration audit must report **40 matching applied migrations, no unresolved failures, no pending files**, for each DB. A successful SQL deploy alone is not evidence of runtime acceptance. In production/staging, run migrations from a separate protected release/CI step with precise environment identity, fresh backups and an approved change window; do not run `migrate dev`, `db push` or a local accidental production target.

## E. Security/operations verification and restore rehearsal

For G11, record manual operational evidence and static/read-only audits; keep the automated smoke helper execution deferred to G12 unless the owner explicitly changes the 2026-11-02 policy. A scratch restore rehearsal is a distinct operator-controlled recovery exercise, not an automatic production restore.

```powershell
Set-Location $backend
# Read-only source/config validation; use staging production environment variables.
node -r dotenv/config scripts/g11-release-preflight.cjs --target=vps
# Or --target=vercel; explain failures, never disable validation just to pass.
node -r dotenv/config scripts/g11-prune-auth-buckets.cjs --expect-db=kookaburra-api-dev
# Deletion is NOT automatic. After owner review, a single bounded <=1000-row batch only:
# node -r dotenv/config scripts/g11-prune-auth-buckets.cjs --expect-db=kookaburra-api-dev --apply
# The automated HTTPS smoke helper is authored but DEFERRED until G12 under the
# owner's current no-automated-tests-before-G12 policy:
# node scripts/g11-smoke.cjs --base=https://your-staging-api.example
# Controlled manual inspection of staging TLS/health/auth/docs/ops is G11 evidence.
# Example: create a disposable empty local DB manually with database privileges,
# name MUST start kookaburra_g11_rehearsal_ and it MUST contain zero user tables.
# createdb kookaburra_g11_rehearsal_20261105
# & 'scripts/g11-restore-rehearsal.ps1' -RehearsalDatabase kookaburra_g11_rehearsal_20261105 -Archive '...dev.dump'
# Restore helper checks SHA256, empty target, pg_restore --exit-on-error, migration count.
# NEVER run restore helper against dev/test/prod databases.
```

External provider/recovery acceptance cannot be scripted from an unauthenticated ZIP. Record separate evidence for Stripe TEST verified settlement/intent cancellation/refund reconciliation, SMTP allowlisted account-flow, FCM device registration/consent/revoke and actual delivery, Cloudinary/S3/disk provider switch/delete/reconcile, Vercel/VPS staging route and G10 scheduler/monitoring, dependency audit and real disposable restore. Leave provider credentials disabled until controlled verification is authorized. See `G11_SECURITY_DEPLOYMENT.md` for limitations and rollback rule.

## F. Deferred G12 test execution — **ONLY when owner explicitly starts G12**

```powershell
# G12 ONLY, after testing is authorized and all DB identities/migrations are verified:
# npm run test
# npm run test:e2e
# npm run test:api:smoke
# npm run test:api:db
# npm run test:api:security
# npm run test:api:visual:all
# npm run alignment:test
```

## G. Three master docs remain OUTSIDE all repositories

```powershell
$docs = Join-Path $env:USERPROFILE 'Desktop\KOOKABURRA-V2-MASTER-DOCS'
New-Item -ItemType Directory -Force -Path $docs | Out-Null
$docArchive = Join-Path $env:USERPROFILE 'Downloads\KOOKABURRA_G11_MASTER_DOCS_20261105.tar.gz'
$docBackup = Join-Path (Split-Path $docs) ('g11-master-docs-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $docBackup | Out-Null
'01_PROJECT_CONTEXT.md','02_ARCHITECTURE_DECISIONS.md','03_BACKEND_ROADMAP_STATUS.md' | ForEach-Object {
  if (Test-Path (Join-Path $docs $_)) { Copy-Item (Join-Path $docs $_) (Join-Path $docBackup $_) }
}
tar -tzf $docArchive
tar -xzf $docArchive -C $docs
# The updated docs state G11 SOURCE PREPARED until actual validation logs are recorded.
```
