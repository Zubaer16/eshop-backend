# Integrated web validation

Status: LOCAL VALIDATION COMPLETE / EXTERNAL ACCEPTANCE PENDING, 2026-11-08. All eight implementation/local-validation steps are complete. Current-source Backend release:local and all frontend/live cross-app checks passed. The release gate is blocked only by missing external evidence; production/provider acceptance is not claimed.

## Resulting structure and fixes

Each Admin and User page renders its own live component. Explicit mode branches preserve preview UIs under components/preview/pages in User and existing preview components in Admin. WorkspaceBoundary only enforces current section permissions; its parent RequireAuth restores/authenticates the staff session. UserBoundary only protects private account, checkout, wishlist and tracking routes. Neither boundary dispatches feature UI by pathname. Live compatibility explains canonical identifiers and validation scope, rather than comparing fixtures as live records.

Unprepared owned payment status now returns explicit application/json null. Nest's omitted null body previously caused the strict web transport to reject the response and prevent unpaid-order recovery after reload. The response schema documents nullability; HTTP regression assertions retain JSON content type and cross-account 404, and the cross-app lost-acknowledgement/reload flow passed.

Live form selects now have stable accessible labels. Admin Field preserves an explicit child aria-label and otherwise supplies its visible label to direct native controls. Product variants, return lines/reasons, delivery choices and inspection no longer acquire option text in their label. Cart/wishlist/tracking metadata describes live behavior only in live mode.

Archived/unknown public products resolve notFound before streaming begins. Root and product loading boundaries were removed so they cannot commit HTTP 200 before absence is resolved; shop/account/checkout keep their own loading UI. Product metadata does not swallow notFound. The real Admin archive -> User HTML response 404 assertion passed. See [Next.js not-found status behavior](https://nextjs.org/docs/app/api-reference/file-conventions/not-found).

Test repairs retain business assertions: use the actual Orders heading after replacing the workspace placeholder, scope success/error selectors to the intended message rather than loading/route announcements, and wait for /cart navigation before reload. Alignment tests compare the authored finding and prove removing coupon creation cannot remain aligned. Earlier failed logs/traces remain local; failures were not ignored or retried into a false pass.

## Validation

- Stable-source live User/Admin/Backend cross-app run: 23/23 PASS, zero retries/skips. Includes persistent login, logout/Back, CSRF, audience/permission/account revocation, catalog/media/inventory retry, shipping/coupon revisions, lost checkout acknowledgements/reload, owned tracking/returns/restock/replacements/refunds, content publication, inbox/preferences/IDOR and staff disable.
- Current-source Backend release:local: PASS across all 12 commands, with 307/307 unit, 13/13 Nest E2E, 64/64 API smoke, 85/85 isolated-DB, 69/69 security, 37/37 Swagger Chromium, 4/4 alignment and 3/3 release-tooling tests. Static/schema/type/lint/build, jobs source and canonical OpenAPI checks also passed. The fresh receipt matches the final Backend source fingerprint. The earlier failed alignment attempt is retained separately.
- Admin: all 9 recorded commands PASS, including check (verify/typecheck/lint/build), six additional verify tasks, 47/47 unit and 39/39 preview Chromium tests.
- User: all 6 recorded commands PASS, including check, three additional verify tasks, 55/55 unit and 18/18 preview Chromium tests. These are full fresh runs after the routing/accessibility fixes.
- Final read-only audits: 21 User + 21 Admin pages, 22 feature groups, 202 API operations / 158 paths, 196 success schemas / 6 absent, 14 gap records; source alignment 7 MATCH / 15 ADAPTER / 0 REVIEW_REQUIRED; 14 form request schemas match canonical OpenAPI. No page.tsx null placeholder remains in either frontend.
- Post-run migration audit: all 40 checksums still match, zero unresolved/pending migrations. Existing release:\* script values and removed plain release alias are preserved.

Both modes use the same 37 Swagger cases/assertions/timeouts and database guards. Existing guarded release commands are unchanged. Optional API_TEST_VISUAL_AUTOMATED=1 selects headless Chromium without the 900ms presentation delay; normal visible demonstration remains the default. It changes presentation only, never safety checks or test selection.

The isolated localhost kookaburra_api_test identity and all 40 applied migration checksums were verified, with zero pending migrations. Fresh custom-format backups have SHA-256 files and successful pg_restore archive listings, including a second backup immediately before final release replay. Tests clean only their owned fixtures. No protected database reset or new schema migration is involved.

Authored manifests v1.8.0 (integration) and v1.24.0 (source alignment) separate implementation from dynamic validation evidence. IMPLEMENTED is source delivery; this report and source-bound receipts record actual execution. Alignment ADAPTER denotes deliberate server-to-view translation, not an unimplemented module or provider acceptance.

## Evidence and reproduction

Ignored evidence is under validation/web-integration/final/: stable runtime source hashes, browser-verified.log, browser results, per-frontend command logs/exit receipts, initial failed traces/logs, backup verification and migration audits. The guarded web report is validation/web-integration/browser-results.json. Backend release receipt is validation/release-local/receipt.json; it covers Backend authored inputs, not sibling frontend execution. Test traces can contain controlled credentials/cookies and stay local.

Backend: set API_TEST_VISUAL_AUTOMATED=1 if unattended, then npm run release:local. Run npm run test:web:integration for all guarded cross-app flows. Frontends: npm run check, npm run test:unit and npm run test:e2e; package verify:\* tasks cover additional adapter/preview source checks. Preserve exact app origins, isolated DB guard and provider-disabled fixture environments.

## Accepted scope and separate acceptance

Guest cart requires customer login before checkout. Country/currency policy, standard/express delivery, UUID orders, single full shipment, same-SKU replacements, owned tracking and STRIPE_TEST-only payment remain. A refund request/provider submission is never confirmed settlement or stock return. No FX, public tracking, cross-SKU financial exchange, partial shipment, browser money/stock authority or silent fixture import was added.

Real SMTP mailbox delivery, FCM/secure-browser display, Stripe TEST provider settlement/refund reconciliation, external media/CDN lifecycle, deployed scheduler recovery, database restore rehearsal, HTTPS/proxy/deployment and secret/dependency acceptance remain separate. The read-only release gate verified all 12 local suite receipts against current source. Its sole failure is the absent validation/release-external/evidence.json for eight external categories; it must stay closed until verified evidence is supplied. Local fixtures/VM workers and disabled-provider flows do not certify those environments. No real provider operation, deployment, commit or push is part of this local validation.
