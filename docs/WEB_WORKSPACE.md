# Web store content, workspace, reports and messaging

Source delivery **2026-11-08: IMPLEMENTED / FULL VALIDATION PENDING**. This closes implementation step 7. All unit/API/DB/browser suites remain deferred to step 8 by owner instruction; source, schema, type/lint/build checks are not runtime acceptance.

## Published storefront

Live homepage reads the bounded published banner/collection projection; collection detail uses `/collections/[slug]` and canonical ACTIVE product cards. Empty/error states are explicit. Product links preserve real slugs; options and purchase actions continue through the existing product/cart flow. Drafts, archived content, preview fixtures, coupon codes and unpublished products never become live fallback data. Configured publication windows and truncated section/card flags remain server-owned.

Public bootstrap supplies store identity/contact, plain-text footer/policies and verified logo/favicon. `/policies/[kind]` renders privacy/terms/returns as escaped plain text. Live footer avoids sample social/newsletter/free-delivery promises. Published SEO/favicon metadata is read through bounded, credential-free no-store server fetch, with live request rendering explicitly retained. Missing configuration yields generic metadata and an honest content error; no draft/private config is embedded. Indexing remains disabled pending deployment acceptance. Explicit preview retains the original fixture presentation.

Public operations apply validated accent hex, light/dark/system appearance, numeric-format locale and the display-currency preference. Actual product/order amounts retain their original currency; the USD catalog/filter policy is unchanged and no FX is performed. Wishlist/policy navigation follows presentation toggles; published policies and permission-checked APIs remain readable directly. Public configuration refreshes on focus/60 seconds; client homepage has explicit refresh. Admin writes do not silently assume cross-app Next cache invalidation.

## Owner/staff workspace

`/content` uses marketing.manage/OWNER for paginated banners/collections, detail, explicit draft/published/archive state, position, timezone-qualified windows, verified image UUID/alt and ordered canonical product UUIDs. Archive is revision-checked and follows existing media lifecycle rules. There is no arbitrary HTML, URL-based media import or inferred publication.

`/settings` is OWNER-only: identity/contact, revisioned SEO/policies, verified branding and operations presentation; notification/email template revisions are separate. Profile remains the Backend's existing last-write-wins API; other revisioned writes use the fetched server revision. Reserved orderPrefix does not generate order numbers, stored origins do not grant CORS, and no credentials/provider modes/payment policy can be edited through presentation settings. Template text remains bounded/plain with Backend placeholder validation.

`/staff` is OWNER-only with persistent role/grant reads, write-only initial password, staff name/role/status changes and explicit role-grant replacement. OWNER has no mutation controls and cannot be assigned by create/update. Disabling replaces preview deletion; fresh Backend identity/grants govern every protected action. Staff passwords are cleared from the form before submission and are never persisted or included in responses. Unknown fields and client-generated revisions are excluded from form payloads.

Fourteen explicit request-form allowlists are grounded in canonical DTO schemas. `node scripts/audit-web-management.cjs` reads the canonical document and frontend data constants to detect drift, without DB/provider/test execution. Source-field metadata is an adapter, not an arbitrary endpoint/schema editor. Failed/uncertain writes require closing and reading server records before another attempt; creates and revisioned writes never auto-replay.

## Reports and operations

`/dashboard`, `/reports`, `/payments` and `/activity` use server projections and current domain permissions. Product/customer performance requires all relevant grants; unavailable dashboard sections remain unavailable rather than invented zeroes. Financial/daily views preserve independent collection/refund dates, explicit UTC inclusive-from/exclusive-to windows, exact integer aggregate strings and separate currency groups. Inventory is current retail/stock information, never profit/cost or historical valuation. Audit uses persistent server events and exact actor UUID filtering.

Paginated report views retain server totals/pages. CSV downloads use the same Bearer/cookie-omitting/session-fenced transport, with a bounded text response option and fixed download names. Server export budgets, formula neutralization and audit remain authoritative; the browser neither recomputes finance nor regenerates CSV. The sales export is the server financial export, including when opened from the daily collection view. Date filters apply on submission, and invalid windows fail through normal API errors.

OWNER `/operations` reads sanitized scheduler status/runs/failures, notification failures, email readiness/submission history/planning failures, and push readiness/submissions/planning failures. These are bounded snapshots, not delivery proof or complete unbounded history. SMTP/FCM ACCEPTED means submission. Only the existing audited retry of an exhausted **DB-only in-app receipt** is exposed; no provider/payment retry, internal cron tick, send-test or deployment switch is invoked.

## Owned inbox and navigation

User `/account/notifications` and Admin `/notifications` read their own persisted inbox, unread filters/counts, page metadata, read/unread actions and timestamp-bounded read-all. Notification preferences use the current revision; marketing opt-ins receive explicit confirmation. Mandatory security email and transactional in-app history cannot be disabled through these forms. Staff messages follow fresh permissions; identity/epoch/component fences prevent delayed results navigating a replacement account.

Two additive JWT-owned navigation routes resolve canonical targets to an allowed same-site path/surface: notification recipient navigation and owned push-delivery navigation. Existing typed target responses are unchanged for API/mobile clients. Customer product/category/collection/offer targets are resolved against public canonical state; order/tracking remains owned UUID lookup. Admin destinations stay in the Admin surface. The browser checks surface/path again and never trusts provider URLs or directly interpolates UUIDs as product slugs.

## Browser push and rich campaigns

Both apps pin **firebase 13.2.0**, lazily importing its browser messaging SDK only for a previously opted-in/configured browser or explicit enable action. Configure these **public** values at frontend build/deployment: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. They must match the reviewed Backend Firebase project/VAPID/provider configuration. Service credentials and token-encryption keys stay Backend-only. No project/provider was provisioned or enabled during implementation.

Enable requires a user-gesture permission request, supported secure browser, configured Backend registration and current account. The existing registration-token compatibility API is used; Backend also supports FID independently. SDK registration data is managed by Firebase's origin-scoped browser storage; auth access/refresh credentials never enter it. Local storage contains only installation UUID and an opt-in account marker. The separate worker has no application-cache/offline behavior.

Registration/refresh/revoke serialize across tabs, use current device revisions and fence the click's original owner/epoch. Account changes rotate/delete the provider registration before a replacement account can register; server uniqueness prevents silent token transfer. Logout disables the worker, revokes the current owned device and attempts SDK token deletion before session logout. If another account signs in during cleanup, the old logout cannot terminate the new session. Local display is disabled even when remote revocation cannot be confirmed. A remotely revoked/missing device is not silently reactivated by automatic restore; explicit enable is required.

Worker state is owner-bound in IndexedDB. It displays **generic lock-screen content**, never order/address/message payload text. Clicks use a fixed inbox route and delivery UUID; authenticated owned navigation resolves the actual target. Logout/account mismatch suppresses display/clicks. No caller-supplied external link is executed. Browser permission and account marketing consent remain separate, and a registration acknowledgement is not provider delivery evidence.

`/messaging` requires marketing.manage/OWNER for draft composition/edit, canonical target/image, selected customers or all opted-in customers, recipient preview and metrics. Only OWNER sees approval/schedule controls for current drafts; cancellation cannot recall submitted messages. Financial/editorial promotions remain separate. Missing public/Backend/provider configuration produces explicit unavailable/error state; real Firebase browser display, token rotation and deployed HTTPS/service-worker/FCM acceptance remain separate evidence work.

SDK references: [Firebase Web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started), [registration options](https://firebase.google.com/docs/reference/js/messaging.gettokenoptions), [messaging lifecycle API](https://firebase.google.com/docs/reference/js/messaging).

## Prepared validation and remaining work

Unexecuted source covers DTO payload allowlists/revisions/null media/password handling, exact authenticated CSV transport, generic worker display/fixed click paths, account-switch permission races, delayed logout cleanup, navigation contract/JWT/privacy, real Admin publish -> User canonical collection, owned inbox/preferences/IDOR and staff disable invalidating credentials. Controlled fixtures and VM worker tests are not external provider proof. Test-source TypeScript and JS syntax can be checked now; suites execute only at step 8.

Step 8 must run all earlier and newly deferred frontend unit/auth/preview suites and Backend unit/API/smoke/isolated-DB/security/cross-app suites, repair failures and complete compatibility/cleanup/handoff. Existing test DB identity/backup/migration safeguards remain. Preserve the forty SQL migrations and existing `release:*` commands; no plain release alias, DB reset/write, migration, real message/provider invocation, deployment, commit/push or fresh full release acceptance occurred in step 7. Historical receipts remain stale after these source changes.
