# Integrated web validation

## Live local-cart migration applied - 2026-11-14

The owner explicitly authorized deployment to the live database using Backend .env credentials. Prisma used DIRECT_URL for the Supabase postgres database at aws-0-ap-south-1.pooler.supabase.com on port 5432. Preflight verified 41 applied migrations with matching checksums, zero unresolved failures and exactly one pending migration, 20261114120000_local_cart_checkout.

Prisma migrate deploy applied that migration successfully. The post-migration status reports the schema is up to date. The read-only audit verified 42 applied migrations, 42 matching checksums, zero unresolved failures and zero pending source migrations. Independent schema queries confirmed that carts, cart_items, guest_carts and guest_cart_items are absent, orders/reservations have zero cart_id references, and checkout_reservations.request_hash is nullable VARCHAR(64).

Preflight found one customer cart and five guest carts. Their saved cart contents were removed by the authorized migration. Before and after migration, order, reservation and payment-attempt counts were zero, physical inventory total was 200 and reserved inventory total was zero.

The live database migration is complete. Updated frontend/backend application deployment remains pending and is required for the new schema. Source changes await commit/push. Credentials stayed private. External Stripe provider/webhook/worker acceptance remains pending.


## Browser-local cart and checkout-only validation - 2026-11-14

The owner approved browser-local cart storage and removal of unused cart APIs and tables. Storefront now uses a provider-scoped Zustand store with versioned localStorage entries for the guest and each signed-in customer. Add, manual quantity entry, plus/minus, removal and clear calculate displayed totals locally. These actions make zero cart API requests. Guest items merge explicitly into the signed-in browser cart. Web Locks serialize same-browser writes and storage events update other tabs. Storage failures retain edits in memory and display a persistence notice.

Checkout submits canonical line/product/variant IDs and quantities. POST /v1/checkout/delivery-options calculates delivery/coupon estimates from submitted catalog selections without inventory joins. POST /v1/checkout/start validates current server prices and stock, locks inventory balances in sorted order and creates the existing replay-safe Stripe TEST hosted session. Request fingerprints include the immutable item selections and checkout policy. Stock shortages report requested and available quantities with user-selected quantity reduction or removal. Verified payment clears the matching submitted local cart. Later cart edits remain available.

The customer authorization guard moved into auth because account, wishlist, orders, payments and checkout share it. The old customer/guest cart controllers, persistence services, capability bridge and transport-only tests are removed. Wishlist remains account API-backed.

Migration 20261114120000_local_cart_checkout was applied only to the guarded local kookaburra_api_test database. It removes Cart, CartItem, GuestCart and GuestCartItem tables and cart_id references from orders/reservations, adds a nullable reservation request hash and preserves existing order, payment and stock-allocation records. Applying it removes old database-saved cart contents. Browser-local carts are device-specific. Coordinated production deployment and the new live migration remain pending. Real Stripe provider/webhook/worker acceptance remains external to the local test receipts.

### Executed local validation

- Frontend production build, type validation, lint and project verification passed. All 57 unit tests and 33 production-browser tests passed with zero retries or skips. Browser coverage includes guest/account Add without cart requests, typed quantity and plus/minus, reload persistence, cross-tab updates, quota-error memory fallback, stock shortage correction/removal, frozen checkout retry, signed-in owner changes cart clearing after verified payment and a concurrent cart edit held behind a browser lock while the checkout snapshot remains frozen.
- Backend build, Prisma schema validation, type validation and lint passed. All 333 unit tests, 13 Jest HTTP tests, 62 API smoke/contract tests, 82 isolated database tests and 67 security tests passed.
- Four browser integration tests against the guarded local backend passed. They exercise actual login, guest-to-account local merge, account isolation, address/customer privacy, configured delivery/coupon totals and owned reservation recovery/release.
- Five Swagger Chromium tests passed across delivery estimation, reservation create/replay/release, order create/replay/cancel and administrative/customer coupon flows. Removed cart capability tests and their unused Swagger authorization helper are retired.
- The isolated local migration audit verified 42 applied migrations, 42 matching checksums, zero unresolved failures and zero pending source migrations. Read-only schema queries confirmed all four old cart tables are absent, both cart_id references are absent and the reservation request_hash column exists.
- Canonical OpenAPI/source audit passed with 193 operations, 187 success schemas and six existing missing success schemas. Four alignment-tool tests and three release-tooling tests passed. Alignment remains seven MATCH and fifteen ADAPTER findings with zero REVIEW_REQUIRED findings.
- The full database run initially exposed an obsolete media fixture file path. Its assertion now uses the persisted objectKey and the rerun passed all 82 tests. The isolated Jest HTTP setup explicitly disables providers and suppresses deployment database URLs. Browser account-switch tests wait for completed logout cookie revocation before starting the next full-page login.


## Live hosted checkout migration applied - 2026-11-13

Owner explicitly authorized migration against the live URL in Backend .env. Prisma used DIRECT_URL for the Supabase postgres database. Preflight verified 40 applied migration checksums and zero unresolved failures, with only 20261113170000_hosted_checkout_session pending. The command npm run db:deploy applied that migration successfully.

Post-migration db:status reports the schema is up to date. The read-only audit verifies 41 applied migrations, 41 matching source checksums, zero unresolved failures and zero unapplied source migrations. Independent read-only catalog queries verify the four nullable PaymentAttempt checkout columns, their declared types/lengths, and the valid unique payment_attempts_checkout_session_id_key index.

The live database migration is complete. Application changes and the migration source remain local and await commit/push. Stripe provider, webhook/worker and application deployment acceptance remain pending. Credentials were kept private.


Current hosted Stripe checkout and stock reservation behavior is documented in [the final checkout flow](CART_QUANTITY_AUTOSAVE.md). Its draft-cart, final-reservation and explicit shortage-recovery sections describe the current implementation.


Current quantity/save policy: [cart autosave and checkout validation](CART_QUANTITY_AUTOSAVE.md). This supersedes older manual quantity forms and Add-time stock-rejection notes below.


## Optimistic atomic cart Add — 2026-11-13

Owner explicitly approved optimistic cart UI, background checks and fewer server round trips. Add now immediately shows item/quantity/estimated subtotal with Syncing, coalesces rapid positive additions (180 ms), and posts one replay-safe atomic delta operation. Definite rejections roll estimates back/cancel unsent work; uncertain outcomes pause and retry only with the identical request UUID/payload. Confirmed quotes, current stock, ownership, reservation and payment authority remain on Backend. Pending estimates block checkout and never become canonical prices. Account changes clear local work; closing the drawer is respected.

Added `POST /v1/cart/items/add` and `POST /v1/guest-cart/items/add`, accepting `{productId,variantId?,quantity,requestId}` and returning the existing CartQuote. Same-owner row locks protect increment + request-hash receipt + fresh quote in one transaction. Identical retry increments once; mismatched reuse is 409. Existing absolute PUT and all other clients remain supported. Uses the existing IdempotencyRecord table (30-day receipt timestamp); no migration, Redis or new dependency. Existing guest cookie/CSRF/Web Lock rules are retained. First guest creation can still require an upstream capability-create before Add within one browser bridge request. **Deploy Backend first, then Frontend.**

Validation: frontend 63 unit + 28 production-browser tests, backend 10 unit + 9 guarded local PostgreSQL cart/guest/checkout/reservation tests PASS; typecheck/lint/build and web-test types PASS. Tested concurrent replay, distinct increments, stock rejection, account fences, uncertain retry and checkout protection. Browser writes are mocked; real writes occurred only in the guarded local test DB. Canonical OpenAPI regenerated (204 operations/198 success schemas/6 existing absences); integration source audit and ordinary alignment audit PASS (7 MATCH/15 ADAPTER/0 REVIEW_REQUIRED). Strict release policy still rejects P0 ADAPTER classifications; full release/provider/deployment acceptance is not claimed. Web contract 1.10.0 / alignment 1.28.0. No commit, push or deployment.

Details: [Frontend architecture and receipts](../../eshop-user-frontend/docs/OPTIMISTIC_CART_ADD_2026-11-13.md), [Backend atomic Add contract](CART_ATOMIC_ADD.md).

## Single Admin workspace — 2026-11-13 (current source)

Owner approved one API-backed Admin using the pre-Backend design, with consistent shared design for new features and no API changes. Removed Admin runtime mode branches, mock store/fixtures/policies, duplicate preview components and old preview-only tests. Retained the existing authenticated transport, feature actions, canonical IDs/minor units, current grants, revision/idempotency and uncertain-write safeguards. Restored dashboard cards/chart, catalog table, order/staff tables and shared headings/record presentation. Runtime preview mode is now retired in both frontends.

Backend API/business/schema remained byte-identical: 401 src/prisma files, SHA-256 `ce787ee70d35598b670593e3699e7ac6d1a267a4323e18cf820f05c6c5ebdfae` before/after (src then prisma, each sorted path+bytes). Backend changes are audit source-evidence paths/metadata only; no endpoint/DTO/schema/business change. Strict alignment: 7 MATCH, 15 ADAPTER, 0 REVIEW_REQUIRED; 4 audit regressions passed. Web source audit covers 202 operations / 22 feature groups / 21 Admin pages and 21 Storefront pages.

Admin local validation: 48 API/session/security/presentation unit tests passed; typecheck, lint, source guard and production build passed. API-shaped browser suite covers connected design, minor-unit write payload, mobile widths, permissions and unavailable/retry states; 24/24 passed against the production build; final results: `../../eshop-admin-frontend/test-results/admin/results.json`. Browser requests are intercepted; these checks do not claim real database/provider or deployed Vercel acceptance. No production writes, commit, push or deployment. Existing local `.env.example` edits preserved. See [Admin consolidation](../../eshop-admin-frontend/docs/ADMIN_CONSOLIDATION_2026-11-13.md).

## Media folder change - 2026-11-09

Media upload source changed after the full local receipt below. See [MEDIA_STORAGE.md](MEDIA_STORAGE.md) for current focused validation: Backend build/lint, 41 media/config tests, Admin check and source alignment passed. Cloudinary authenticated ping/settings passed; actual upload lifecycle, full release and cross-app browser suites have not been rerun for this change. Earlier full local receipts are historical for this source revision.

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
