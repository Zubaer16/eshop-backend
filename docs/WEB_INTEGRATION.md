# eShop web integration

Current combined validation is tracked in [Web validation](WEB_VALIDATION.md). Implementation-time test deferrals and earlier acceptance counts below are historical for their snapshots.


Status on 2026-11-08: **all eight implementation/local-validation steps complete; external acceptance remains separate**. Current-source Backend release:local, 23 live cross-app flows, 47 Admin + 55 User unit tests and 39 Admin + 18 User preview tests passed. Each page renders its own feature and boundaries enforce only current authentication/permissions. Explicit preview stays separate. [Web validation](WEB_VALIDATION.md) records final source-bound evidence, accepted v1 limits and the missing external acceptance evidence.

Current source audit: **21 User + 21 Admin page entrypoints, 22 feature groups, 202 canonical API operations and 14 gap records**. There are **196 success schemas present / 6 absent**, across 158 API paths. The original step-1 snapshot was 15 + 16 pages and 198 operations; persistent auth later had 18 + 17 pages. Schema presence is not runtime proof.

## Content/workspace/messaging/reports source delivery - 2026-11-08 (historical source snapshot)

Step 7 source is implemented; full validation is pending. Live published homepage/collection/identity/SEO/branding/policies/operations, OWNER staff/settings/templates, permission-aware reports/dashboard/audit/CSV, owned inbox/preferences/browser push and rich campaign/operational panels are connected. Two additive JWT-owned same-site navigation routes preserve legacy target responses. Firebase 13.2.0 is pinned; public Firebase/VAPID and matching Backend provider/deployment/browser evidence remain separate. SDK and worker source fences account/epoch/queued cleanup and displays generic lock-screen content. No suites, real provider actions or DB migrations were run. See [Web workspace](WEB_WORKSPACE.md). Next: step 8 all deferred tests, fixes, compatibility/cleanup and handoff.

## Order operations/recovery source delivery - 2026-11-08

Step 6 source is implemented; full runtime validation is pending. User owned history/detail, unpaid cancellation, return request/withdrawal and authenticated UUID tracking use real order/return/replacement/refund ledgers. Admin connects one-shipment fulfillment, physical inspection/restock, same-SKU replacement dispatch and OWNER-only refund approval/history. Keyed mutations preserve frozen UUID/body for explicit retry and ledger reconciliation. Only server SUCCEEDED confirms a refund; stock return remains separate. Existing order list capabilities are explicitly limited to server pagination and exact UUID lookup, with no global text/status/date/customer filters. Three missing order response schemas are now explicit. No suites, provider actions or DB migrations were run. See [Web orders](WEB_ORDERS.md). Next: step 7 content/settings, messaging, staff, reports and operations.

## Checkout/shipping/promotions source delivery - 2026-11-08

Step 5 source is implemented; full runtime validation is pending. User checkout connects owned addresses, delivery/coupon estimates, ten-minute holds, unpaid orders and explicit TEST-only preparation/completion with server status refresh. Additive customer-owned recovery supports reload/lost acknowledgements without storing address data in browser storage. Admin connects OWNER-only rates/zones, marketing coupon/campaign revisions/quotas and permission-gated payment attempt records. No test suite, provider activation or DB migration was executed. See [Web checkout](WEB_CHECKOUT.md). Next: step 6 order operations, fulfillment, tracking, returns/replacements/refunds.

## Account/cart/wishlist/customer directory source delivery - 2026-11-07

- User owned profile/display-name and address CRUD/default forms, live product/cart/header/drawer, account wishlist and Admin read-only customer search/details are implemented. Private rows reset across session/owner changes; no preview-store import.
- A separate HttpOnly guest capability cookie preserves the existing fixed 14-day cart. The same-origin bridge applies exact-origin CSRF, bounded action/field allowlists and quote redaction. Login merge is explicit, current-customer checked, atomic on the Backend and preserves conflicts for editing.
- Add becomes a fresh-quote-based absolute PUT under a shared shopping lock. Uncertain changes retain the same desired payload for explicit retry/reconciliation. Cart subtotal is not a payable total; no stock reservation or checkout payment is enabled here.
- Wishlist is account-owned; anonymous Save returns through sign-in/signup, with no local guest wishlist or fixture import. Customer directory exposes no address contents or browser-calculated spend. Notification preferences/financial reports remain with their owning later work.
- Guest revoke now has an explicit response DTO. **Test code is prepared, not executed**; only typecheck, lint, build and source/contract checks apply. See [Web account/cart integration](WEB_SHOPPING.md).

## Catalog, media and inventory source delivery - 2026-11-07

- Admin category/product/variant CRUD, explicit archive/publication, verified media library/uploads/gallery and inventory balances/threshold/adjustments/movements are implemented. Staff reads and permission-limited writes follow Backend guards.
- User category navigation/shop/filters/product detail and metadata use real API IDs, prices and images. Product pages refresh availability and choose variants explicitly. Cart/wishlist are implemented in the next source-delivery record above; checkout remains step 5.
- Additive API work: bounded current-namespace media library with exact UUID search, optional product currency filter and complete response schemas for these connected operations. Existing Backend rules, SQL and release scripts are preserved.
- **Test code is prepared, not executed.** Only typecheck, lint, build and source/OpenAPI checks apply to this delivery. Final API/DB/browser proof, including Admin publish -> same canonical product in User and stock retry/reconciliation, remains pending. See [Web catalog](WEB_CATALOG.md).

## Historical authentication acceptance snapshot — 2026-11-07

- User signup/login/current identity/logout, password change, verification request/confirmation and password recovery/reset use real APIs. Admin has separate staff sign-in, current-grant navigation and deep-link permission checks. No public staff registration.
- Owner replaced the initial memory-only policy: refresh credentials now use persistent same-origin HttpOnly cookies. Reload/new tabs restore current identity; access tokens stay in memory and domain calls still omit cookies. Session exchanges require exact-origin CSRF checks, with rotation serialized across tabs. GET may replay once; writes never replay automatically. See [Web authentication](WEB_AUTH.md).
- Executed: **13/13 persistent-session cross-app browser tests**, **24/24 auth/session/bridge tests per frontend**, **58/58 API smoke tests**, **3/3 alignment tests**. The previous explicit-preview regression run passed **18 User + 39 Admin tests**; it is separate from this persistent-session validation. Both frontend checks and Backend static checks are recorded with the delivery evidence.
- Signup test correction waits for the destination signup heading before filling shared email/password labels. Verification/reset links clear fragments and reject reused challenges. Browser tests assert no unhandled page errors.
- Guarded browser runner used only localhost `kookaburra_api_test`, with a verified backup and 40 matching applied migration checksums. No schema migration, dev database reset or real provider delivery. Test action tokens are read only inside controlled fixtures; production pages never expose them.
- Auth UI/transport gaps are resolved. Profile/address CRUD and other response contracts remain scheduled in their owning steps. Catalog/media/inventory is next.

## Source of truth and repeatable audit

- Authored flow/gap contract: `contracts/web-integration.v1.json`.
- Canonical API document: `artifacts/release/openapi.json`, generated by `npm run release:openapi`.
- Controller/guard/DTO implementations, existing API DB/security/OpenAPI tests and actual frontend source take precedence over historical planning documents.
- `npm run integration:audit` verifies page coverage, API-to-controller route identity, feature API prefixes and source references. Use `npm run integration:audit -- --write` to save ignored `validation/web-integration/audit.json`; `--json` prints its complete route/schema/source inventory. Missing input repos or drift fail the audit; they are never reported as aligned.
- Root overrides: `ESHOP_ADMIN_DIR` and `ESHOP_STOREFRONT_DIR`, with existing legacy overrides supported. The three sibling folders are `eshop-backend`, `eshop-admin-frontend`, `eshop-user-frontend`.
- Compatibility source audit v1.23.0 reports 7 MATCH / 15 ADAPTER. It covers 22 historical compatibility findings, a different count from the new 22 integration feature groups and 14 gaps. Neither static audit proves a live browser flow.

The generated audit lists each operation's method/path, request/response/query schemas, security metadata, source controller line and guard annotations. Treat guard names as evidence pointers: inspect the guard/service for the actual rule. Hidden cron endpoints and signed provider webhooks are not browser UI actions.

## Delivery order

| Step | Deliverable                                                                | Current status                      |
| ---- | -------------------------------------------------------------------------- | ----------------------------------- |
| 1    | Contract and screen/action audit                                           | AUDIT_COMPLETE                      |
| 2    | API transport, authentication, session and permissions                     | COMPLETE                            |
| 3    | Catalog, categories, variants, media and inventory                         | IMPLEMENTED_FULL_VALIDATION_PENDING |
| 4    | Profile, addresses, carts, wishlist and customer directory                 | IMPLEMENTED_FULL_VALIDATION_PENDING |
| 5    | Shipping, tax, coupons, checkout, payment and order creation               | IMPLEMENTED_FULL_VALIDATION_PENDING |
| 6    | Order operations, fulfillment, tracking, returns, replacements and refunds | IMPLEMENTED_FULL_VALIDATION_PENDING |
| 7    | Content/settings, messaging, staff, reports and operations                 | IMPLEMENTED_FULL_VALIDATION_PENDING |
| 8    | Cross-app E2E/security, fixture removal, cleanup and handoff               | NOT_STARTED                         |

The first connected vertical slice is: OWNER/staff signs in -> creates category/product/verified gallery -> publishes ACTIVE -> User lists/opens the same canonical product -> inventory changes refresh the User availability hint. Implement this slice before extending checkout; execute its cross-app proof in the final test window under the current owner policy. Preserve the existing visual design; add genuine controls/states where the preview has no functionality.

## Complete existing route coverage

| App / existing route             | Feature groups                 | Delivery steps |
| -------------------------------- | ------------------------------ | -------------- |
| user `/account/addresses`        | profile                        | 4              |
| user `/account/orders/[orderId]` | orders, recovery               | 6              |
| user `/account/orders`           | orders                         | 6              |
| user `/account`                  | profile                        | 4              |
| user `/account/settings`         | profile                        | 4              |
| user `/cart`                     | cart                           | 4              |
| user `/categories`               | catalog                        | 3              |
| user `/checkout`                 | checkout, payments             | 5              |
| user `/`                         | merchandising, settings        | 7              |
| user `/product/[slug]`           | catalog                        | 3              |
| user `/shop`                     | catalog                        | 3              |
| user `/forgot-password`          | auth                           | 2              |
| user `/reset-password`           | auth                           | 2              |
| user `/sign-in`                  | auth                           | 2              |
| user `/sign-up`                  | auth                           | 2              |
| user `/verify-email`             | auth                           | 2              |
| user `/track`                    | recovery                       | 6              |
| user `/wishlist`                 | wishlist                       | 4              |
| admin `/activity`                | reports                        | 7              |
| admin `/alignment`               | developer-alignment            | 8              |
| admin `/categories`              | catalog                        | 3              |
| admin `/content`                 | media, merchandising, settings | 3, 7           |
| admin `/customers`               | customers                      | 4              |
| admin `/dashboard`               | reports                        | 7              |
| admin `/inventory`               | inventory                      | 3              |
| admin `/media`                   | media                          | 3              |
| admin `/orders`                  | orders, recovery               | 6              |
| admin `/payments`                | payments, reports              | 5, 7           |
| admin `/products`                | catalog, media                 | 3              |
| admin `/promotions`              | promotions                     | 5              |
| admin `/reports`                 | reports                        | 7              |
| admin `/settings`                | media, settings                | 3, 7           |
| admin `/shipping`                | checkout                       | 5              |
| admin `/staff`                   | staff                          | 7              |
| admin `/`                        | auth                           | 2              |
| admin `/sign-in`                 | auth                           | 2              |

Shared header/cart drawer/product cards/options/gallery, account layouts, checkout panels, Admin product/order drawers and navigation must change with their owning feature; page files alone are not sufficient. Account security/profile/address CRUD are live source; checkout now uses saved-address snapshots. New missing surfaces may be pages or panels; route names are not assumed implemented until they exist.

## Initial step-1 gap findings and disposition (historical inventory; see step-2 update above)

| ID / priority              | Classification / step   | Finding and required action                                                                                                                                                                                                                                                             |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-AUTH-UI / P0           | MISSING_FRONTEND / 2    | **Admin login/guards and functional User sign-in/up.** Existing backend auth endpoints; add staff login outside guarded layout and current identity bootstrap.                                                                                                                          |
| GAP-TRANSPORT / P0         | ADAPTER / 2             | **Dormant transport conflicts with approved JWT contract.** Remove cookie-only assumptions; support Bearer auth, PUT, safe query/path encoding, 401 single-flight refresh, typed errors, AbortSignal and domain-specific retry/idempotency rules.                                       |
| GAP-RESPONSE-CONTRACT / P0 | BACKEND_CONTRACT / 2    | **Success schemas missing on part of OpenAPI.** Audit records operations with no 2xx content schema; triage bodyless/backend-only operations and add explicit DTOs/contract assertions where frontend reads a body. Presence of a schema alone does not prove complete fields.          |
| GAP-IDENTITY / P0          | ADAPTER / 3             | **Fixture identifiers are incompatible with real API identities.** No automatic fixture/cart/order import, name guessing or all-page client filtering.                                                                                                                                  |
| GAP-MEDIA-LIST / P1        | BACKEND_EXTENSION / 3   | **No reusable media library asset list/search.** Add bounded permission-checked GET /v1/admin/media when implementing the verified picker; no provider credential exposure.                                                                                                             |
| GAP-ORDER-FILTERS / P1     | BACKEND_EXTENSION / 6   | **Customer/staff order lists expose page/limit only.** Add documented filters required by the current UI, or explicitly reduce UI capabilities; test pagination/ownership/grants and never filter a single page as global results.                                                      |
| GAP-ACCOUNT-UI / P1        | MISSING_FRONTEND / 4    | **Profile/address/security are placeholders; reset/verify pages missing.** Implement existing APIs with ownership, one-time-token lifecycle and session revocation; do not expose token debug data.                                                                                     |
| GAP-FULFILLMENT-UI / P0    | ADAPTER / 6             | **Local order state machine/return initiation/refund success conflicts with backend.** Use separate payment/fulfillment states, customer-initiated returns, explicit inspection/restock and request-versus-confirmed-refund status.                                                     |
| GAP-MESSAGING-UI / P1      | MISSING_FRONTEND / 7    | **No working inbox, email operations, push composer/device UI.** Implement existing APIs; real SMTP/FCM/browser project configuration and external evidence remain separate.                                                                                                            |
| GAP-SETTINGS-UI / P1       | MISSING_FRONTEND / 7    | **No complete verified branding/policy/collection-detail surfaces.** Add pages/panels using existing safe projection/revision/media contracts.                                                                                                                                          |
| GAP-REPORTS / P0           | ADAPTER / 7             | **Browser-derived financial totals and statuses are incompatible.** Replace with server reports; preserve exact minor units, currencies, timestamps, lifetime-vs-period distinction and field privacy.                                                                                  |
| GAP-STAFF-UI / P0          | ADAPTER / 7             | **Staff password input missing; removal is local deletion.** Write-only password on create; map removal to allowed disable/status change, preserve immutable OWNER and fresh grants.                                                                                                    |
| GAP-RELEASE-EVIDENCE / P1  | EXTERNAL_VALIDATION / 8 | **Current receipt is historical and external manifest absent.** Preserve existing release:\* scripts; fresh local receipt when current-source release acceptance is requested. Provider/restore/deployment evidence cannot be fabricated.                                               |
| GAP-OPTIONAL-SCOPE / P2    | OWNER_SCOPE / 8         | **Production card payments, public tracking, newsletter, cross-SKU/partial shipments.** Do not infer optional features from decorative preview UI. Current v1 remains TEST payments, owned tracking, same-SKU replacement and one shipment; new business scope needs explicit decision. |

## Feature/action and permission map

### auth — step 2: User and staff authentication

Actions: register, sign in, refresh, logout, read current identity, guard private routes.

Authorization: Customer credentials vs staff login; no public Admin registration.

API families: `/v1/auth`, `/v1/admin/auth`.

- Owner-approved persistent web sessions use a limited same-origin auth bridge and HttpOnly refresh cookies; access tokens remain in memory. Reload restores identity. Domain APIs still use Bearer JWT; mobile/API contracts are unchanged.
- Single-flight refresh, at most one replay of a safe request, no refresh loop; logout and account/role changes clear private data.
- Signup CredentialsDto has email/password only; optional display name uses authenticated account/profile PATCH after registration.
- User forgot/reset/verify pages exist in source; validate the one-time token flows and fragment handling in isolated live browser E2E before considering them accepted.

### catalog — step 3: Catalog navigation, search and product pages

Actions: list/search/filter/page, product detail, create/update/archive, variant CRUD, publish and see in storefront.

Authorization: Public ACTIVE-only reads; staff reads, catalog.manage mutations.

API families: `/v1/categories`, `/v1/products`, `/v1/admin/categories`, `/v1/admin/products`.

- Backend UUIDs/variant IDs and slugs are canonical. No fixture migration or matching by name.
- UI localized title/name drafts differ from actual scalar backend fields. Preserve categoryIds, explicit primary UI category, hasVariants and effective variant prices.
- Explicit ACTIVE/DRAFT/ARCHIVED mapping; do not map ARCHIVED to Draft or silently relist it.
- Shop URL q/stock/price presets map to search/inStock/minPriceMinor/maxPriceMinor; featured sorting has no equivalent backend ranking.
- Product metadata/static params and empty/not-found states must stop relying on fixture slugs.

### media — step 3: Verified uploads, product galleries and reusable assets

Actions: sign upload, provider-specific direct upload, complete verification, replace gallery, reuse asset, reference-safe delete.

Authorization: Current catalog.manage media guard; deletion/reference rules remain server-side.

API families: `/v1/admin/media`, `/v1/media`, `/v1/admin/media-deletion-jobs`.

- Raw external image URLs cannot stand in for canonical verified media IDs. Provider upload verb/headers/form fields come from server instructions.
- The bounded current-namespace asset library and gallery picker are implemented; final runtime verification remains deferred.
- Marketing-only staff cannot assume upload rights: media currently requires catalog.manage; use existing assets or an authorized uploader, and request approval before changing grants.

### inventory — step 3: Physical stock, reservations and adjustments

Actions: list/page, read SKU balance, threshold update, idempotent adjustment, movement history.

Authorization: staff reads; inventory.adjust for adjustment/threshold writes.

API families: `/v1/admin/inventory`.

- Use InventoryBalance ID, not product ID, as adjustment identity. Physical, reserved and available quantities are separate.
- No stock writes through product edits; product/variant stock fields are initial-creation values or read mirrors.
- A mutation request keeps the same idempotency UUID across a retry, then refetches authoritative state.

### profile — step 4: Customer profile and addresses

Actions: read/update own profile, address list/create/edit/delete/default, password change, notification preferences.

Authorization: Customer-owned identity; current email/role are not editable profile fields.

API families: `/v1/account`.

- Live profile and owned address forms are implemented; final runtime validation remains deferred. Password change/reset revokes sessions; clear client state and sign in again.
- Do not infer location from private addresses in staff reports or expose another account data through cached queries.

### cart — step 4: Guest/customer cart and login merge

Actions: guest cart creation/token, add/update/remove/clear, quote, login merge and replay.

Authorization: Guest capability in X-Guest-Cart-Token; customer Bearer JWT for owned cart/merge.

API families: `/v1/cart`, `/v1/guest-cart`.

- Cart drawer/header controls are shared UI surfaces beyond the page route. Do not submit legacy demo cart IDs to the real API.
- Guest token is a capability: isolate it from JWTs, avoid logs, honor revoke/merge and ownership. Persisted old preview cart remains separate; do not silently import guessed identities.
- Backend quote is authoritative; UI stock indicators and local subtotal previews do not reserve stock.

### wishlist — step 4: Owned wishlist

Actions: list, add/remove, bounded merge.

Authorization: Customer-owned Bearer JWT.

API families: `/v1/wishlist`.

- Web wishlist is login-required; anonymous Save returns to the product through sign-in/signup. No local guest wishlist or old fixture-ID import is introduced.
- Wishlist cannot be shown as server-saved until the API mutation succeeds.

### customers — step 4: Staff customer directory and detail

Actions: search/page/status filter, detail, recent orders, separate financial performance.

Authorization: customers.view; financial customer reports additionally require payments.view.

API families: `/v1/admin/customers`.

- Existing location and lifetime-spend columns are not provided by directory DTO; remove/relabel or use authorized reporting, never recompute finance from one loaded order page.
- Directory is read-only; no account-disable/delete/edit API should be invented to satisfy an unapproved UI action.

### checkout — step 5: Delivery quote, stock holds and unpaid order creation

Actions: configured country/currency estimate, delivery options, coupon, reserve/release, create/replay order.

Authorization: Customer JWT before estimate/reserve/order; OWNER only for checkout rate/zone policies.

API families: `/v1/checkout`, `/v1/admin/checkout`.

- Guest cart is supported, guest checkout is not. Require login before checkout and merge safely.
- UI standard/express delivery identifiers map to configured options. Other country is not an ISO country; unsupported/unconfigured destinations show a real error.
- UI tax is percent; backend basis points. Fee/cap/minimum values convert losslessly to minor units. Nullable unlimited caps/threshold semantics need explicit mapping.
- Estimate -> reservation -> order must preserve chosen address/country/service/coupon and request IDs; expire/requote on conflicts.
- Order creation is mapped separately by orders feature; do not send client totals or set PAID from a redirect.

### orders — step 6: Customer history and staff fulfillment

Actions: create unpaid order, own history/detail/cancel, staff order list/detail, fulfillment start/ship/deliver.

Authorization: Customer ownership; orders.manage for staff actions.

API families: `/v1/orders`, `/v1/admin/orders`.

- Live order lists use existing server pagination and exact UUID lookup. Global text/status/date/customer filters are explicitly unavailable; no single-page global filtering.
- Order payment status and shipment fulfillment status are independent; UI Pending/Processing/Shipped/Delivered is not a reversible map to Order.status.
- One shipment/all lines only in approved v1; no split shipping. Paid refunds are separate from unpaid cancellation.
- Dedicated return/replacement/tracking actions are assigned to their own features.

### payments — step 5: Owned TEST payment preparation and safe payment state

Actions: prepare, read verified state, controlled fixed-card TEST completion, staff ledger reporting.

Authorization: Customer-owned payment APIs; refunds OWNER; reporting payments.view.

API families: `/v1/payments`, `/v1/admin/payments`.

- Current provider is STRIPE_TEST only; prepare never returns client_secret. Do not wire a real card/Stripe Elements form or claim production charging from current endpoints.
- Existing test-complete is fixed TEST capability and must be clearly gated. Actual provider verification remains separate.
- Webhook is backend-only signed input, never a browser action. Refund POST creates a request, not proof of a successful refund.
- Admin simulated payment statuses/country search and finance totals must be replaced by the real attempt/collection/refund projections.

### recovery — step 6: Returns, same-SKU replacements and owned tracking

Actions: customer return request/withdraw, staff approve/reject/receive/restock, same-SKU replacement lifecycle, owned tracking, refund request/history.

Authorization: Customer return initiation/ownership; orders.manage inspection/fulfillment; OWNER refund requests.

API families: `/v1/orders`, `/v1/admin/orders`.

- Admin preview requestReturn has no staff return-initiation API: move initiation to the customer flow instead of impersonating a customer.
- Return approval, inspection and restock are separate. Refunding never implies stock return. Replacement is same-SKU only; cross-SKU exchange is post-v1.
- Tracking is authenticated own UUID-based lookup; do not introduce public email/order-number tracking from the fixture UI.
- No direct generic status setter, manual paid flag or local successful-refund record is allowed.

### merchandising — step 7: Homepage, collections and safe publication

Actions: banner/collection CRUD, revision-aware publish/archive, schedule, public homepage and collection detail.

Authorization: marketing.manage or OWNER for edits; public effective publication only.

API families: `/v1/admin/store/banners`, `/v1/admin/store/collections`, `/v1/store/homepage`, `/v1/store/collections`.

- Existing enabled/position/subtitle/imageUrl fields map to status/schedule/sort/verified media IDs; no silent publication.
- Collection detail route is missing. Static homepage layout may remain presentation while data comes from the API.

### promotions — step 5: Financial coupons and editorial campaigns

Actions: coupon rules/limits/windows/categories, campaign linkage, usage, disable/archive.

Authorization: marketing.manage or OWNER.

API families: `/v1/admin/promotions`, `/v1/promotions`.

- Financial campaigns and approved rich push campaigns are separate APIs; do not merge their states/approvals.
- Integer discounts/currency/date windows/null unlimited limits remain authoritative on the backend. Zero-total coupon checkout remains outside approved v1.

### settings — step 7: Store profile, SEO/content, verified branding and operations

Actions: profile, content/policies, branding, bootstrap, operations.

Authorization: OWNER for configuration; public safe projections only.

API families: `/v1/store`, `/v1/admin/store`.

- Current one-form settings must split profile fields from revisioned operations/content/branding. orderPrefix is reserved and does not generate human-readable order IDs.
- Configured origins are presentation metadata; actual CORS comes from deployment. Backend currency is not a frontend FX conversion.
- Missing policy views/branding editor may be pages or panels; use backend plain text and safe links, not raw HTML.

### staff — step 7: Staff lifecycle, fresh grants and immutable OWNER

Actions: list/create, role/status update, role permission update.

Authorization: Current backend OWNER/staff.manage rules; OWNER cannot be created/delegated by the browser.

API families: `/v1/admin/staff`, `/v1/admin/roles`.

- UI display roles map explicitly to persistent uppercase role keys. Never authorize from browser seedRolePermissions.
- Staff create requires a password, absent from the current preview form. Keep it write-only and out of persisted state.
- UI removeStaff maps to permitted disable/status update; backend has no physical staff-delete route.

### reports — step 7: Permission-aware financial reports, dashboard and audit

Actions: server aggregates, bounded filters/page, exact-currency charts, safe CSV export, safe audit read.

Authorization: Fresh per-report grants; dashboard.view alone does not grant finance/customer/inventory access.

API families: `/v1/admin/reports`, `/v1/admin/dashboard`, `/v1/admin/activity`.

- Use verified TEST collection facts and independently confirmed refunds, not order fulfillment-derived revenue or local arithmetic.
- Report aggregate minor-unit strings remain exact; no Number conversion/FX/profit inference. Inventory is a current snapshot; financial windows are UTC [from,to).
- UI inclusive end date maps to next UTC day. CSV is server-generated, max 1000 rows/5 MiB; surface narrowing errors.
- Payment attempt states and derived collection/refund states are separate; do not invent a provider-failed state for an unverified attempt.

### notifications — step 7: Own inbox/preferences and guarded template/failure tools

Actions: inbox/unread/read/read-all, consent/preferences, typed target navigation, owner templates/failures.

Authorization: Owned authenticated inbox; current staff grants/consent, OWNER administration.

API families: `/v1/notifications`, `/v1/admin/notifications`.

- Header bells are missing/disabled UI, not missing notification APIs. Add User/Admin inbox surfaces and sign-out cache clearing.
- Dispatch/provider deployment remains separate from rendering a real inbox.

### email — step 7: Email readiness, templates and safe delivery history

Actions: owner readiness, template overrides, submission history, planning failures.

Authorization: OWNER only.

API families: `/v1/admin/email`.

- Missing Admin UI, existing backend. Keep SMTP credentials deployment-only, no public test-send or token-debug endpoint.
- Accepted submission is not mailbox delivery; real verify/reset email acceptance still needs controlled external evidence.

### push — step 7: Web device lifecycle and approved rich campaigns

Actions: explicit permission, register/refresh/revoke installation, campaign compose/preview/approve/cancel, metrics, authenticated tap routing.

Authorization: Owned devices and current consent; marketing.manage composer, OWNER approval/operations per route.

API families: `/v1/notifications/push`, `/v1/admin/push`.

- Both clients lack Firebase setup/service worker and device lifecycle integration. Provider/browser project configuration is required for actual display tests.
- Registration tokens stay out of logs; rotate/revoke across account switch/sign-out. Provider acceptance does not prove display or click.

### jobs — step 7: Read-only operations and bounded in-app recovery

Actions: owner status/runs/failures, approved in-app notification retry.

Authorization: OWNER only.

API families: `/v1/admin/jobs`.

- Missing operational Admin surface, existing backend. Do not expose internal cron secrets or create generic payment/refund/SMTP/FCM retry buttons.

### developer-alignment — step 8: Preview-only compatibility diagnostics

Actions: review integration contracts, remove stale preview notices after tested activation.

Authorization: Development diagnostic, not an authorization source.

- Existing route is a static compatibility preview. Keep it clearly diagnostic and avoid claiming source audit is live end-to-end acceptance.

## Runtime implementation rules

Each app has one API transport boundary and explicit API-to-view adapters. Support all used verbs, safely encoded query/UUID/slug values, cancellation, typed validation/conflict/rate-limit errors, and explicit loading/empty/error/permission states. Never silently fall back to fixtures or issue a local success toast before a mutation is confirmed. Keep canonical money/currency and exact aggregate strings through calculations; formatting is presentation only.

Use Bearer JWT for domain APIs. User and Admin sessions, cookies and private caches are separate. The owner replaced the original memory-only policy: persist refresh credentials in same-origin HttpOnly cookies through a limited Next auth bridge; access tokens remain in memory. Reload/new tabs restore fresh identity before private screens render. No auth secrets in Zustand, localStorage, sessionStorage, server-rendered HTML, logs or URLs. See WEB_AUTH.md for exact-origin CSRF, cookie attributes, environment configuration and cross-tab lifecycle. Guest cart capabilities are separate from authentication and require their own storage/lifecycle policy. Refresh rotation is single-flight; do not blindly replay money/stock/order writes after 401/timeouts without the same server idempotency key and reconciliation contract.

Private server data is never a browser-local authoritative database. Start private reads with no-store; reset on logout/account/permission changes. Public catalog/content caching must have a deliberate freshness strategy across two independently deployed apps; a mutation in Admin does not automatically revalidate the User app's Next.js cache. Do not put access tokens/private response data in shared SSR caches or persist guest capability state as a staff session.

No fixture ID/name matching, hidden seed imports, role spoofing, forged totals, local PAID flags, public order/email tracking, cross-SKU exchange, split shipments, fake refund success or production card charging. Existing backend-approved scope remains authoritative. Server append-only audit is not replaced by the old browser activity feed. Plain-text templates/policies and safe internal CTAs remain subject to server validation, not arbitrary HTML/redirect execution.

Only public configuration goes in NEXT_PUBLIC variables. SMTP/FCM service credentials, Stripe keys, signing/encryption secrets and internal cron secrets stay deployment-owned on the backend. Real external email/push/payment/media/deployment acceptance remains a separate evidence task; no test-send/provider switch/production write is part of this source audit.

## Validation and handoff

Owner instruction on 2026-11-07 supersedes the earlier per-delivery execution policy: **write tests with each remaining implementation, but run all automated suites together only after the remaining implementation steps are finished, in step 8**. Earlier executed auth/source-audit results remain evidence for their own tested snapshots.

During steps 3-7, run appropriate TypeScript (including new test sources), lint, build and read-only source/contract audits. Inspect compound package scripts and avoid commands that also execute tests. Mark deliveries IMPLEMENTED / FULL VALIDATION PENDING. Static/build checks do not establish live behavior or acceptance.

At step 8 execute all existing and deferred unit/API/isolated-DB/security/cross-app browser suites, including ownership/session expiry, role revocation, stale revisions, cart/account switching, timeout/retry/idempotency and provider-disabled flows. Resolve failures and rerun affected suites before final acceptance; do not weaken assertions or claim unexecuted PASS results. Keep database identity, backup and applied-migration protections for any DB work.

Preserve existing Backend `release:*` commands and the removed plain release alias. Source edits invalidate historical source-bound receipts; generate complete fresh acceptance evidence for the final integrated candidate. External provider/deployment proof remains separate.

Update the authored manifest and all three external master docs with implementation and validation status after each delivery. Keep functional filenames, preserve existing uncommitted work and avoid incremental patch archives. Documentation-only policy updates require no test execution.
