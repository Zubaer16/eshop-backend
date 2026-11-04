# G9 validation status

2026-11-02: IMPLEMENTED / FULL VALIDATION PENDING. Build/migration success is not local gate acceptance.

Executed successfully:

- npm run check:static: Prisma generate/validate, source typecheck, Swagger syntax (37 files), ESLint and Nest build.
- Static compilation of six API/Chromium helper/test files with zero errors. Test modules were not executed.
- Read-only alignment audit v1.15.0: 6 MATCH / 16 ADAPTER / 0 PLANNED / 0 REVIEW_REQUIRED, 22 findings.
- Separate local dev/test identities, prior applied SQL hashes, fresh custom-format backups, SHA-256 and pg_restore archive-list inspection before additive migration.
- Seven reporting indexes deployed; 38 active matching applied migrations on each DB, no unresolved failures. Historical G4 resolved rollback retained; no prior SQL/history/reset changed. Read-only metadata found zero prepared report export audits.

Evidence is external: KOOKABURRA-V2-MASTER-DOCS/validation/2026-11-02-g9/. Existing G5–G8 uncommitted source and HEAD 004dccc were preserved. No dependency added; G7's existing production dependency audit debt remains.

Authored but NOT RUN: policy/DTO unit tests, reporting DB/security/OpenAPI tests, focused Swagger Chromium, updated alignment and exact Swagger tag assertions. All automated execution remains deferred to G12. No report SQL/API/CSV, dispatcher, SMTP, FCM, OAuth or browser workflow ran. Tests cover verified settlement/refund isolation, currencies and snapshots, permission changes, private projections, physical/reserved inventory, literal searches and CSV guards. Their assertions are not runtime evidence.

Static compilation exposed typing/lint errors, corrected without executing tests. The earlier G6 order-create fixture expected 201 despite OrdersController's explicit HTTP 200; its assertion now follows that existing contract. No test is disabled or skipped to hide failures.

DB default timezone is Asia/Dhaka. Reporting transactions pin UTC locally and export audit creation uses explicit UTC; global settings and historical timestamps are unchanged. Clock metadata is recorded as text to avoid client-local reinterpretation. SQL result semantics, adapter behavior, refund dates, pagination, query performance and concurrency still need real G12 execution.

G2 actual email/account-flow acceptance remains OPEN. G5–G9 runtime validation, frontend integration, G10 hardening, G11 provider/deployment/full restore and G12 Backend RC acceptance remain open. See G9_REPORTING_ACTIVITY.md for contracts and limits.
