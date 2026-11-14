# Web checkout, shipping and promotions

## Tax removal and optional delivery defaults - 2026-11-14

The owner requested removal of checkout tax and a delivery charge of zero when no amount is configured. New checkout estimates and reservations use taxMinor 0. Tax configuration fields and tax_bps columns are removed. Existing order and reservation tax snapshots retain their recorded amounts, including frozen payment retries.

Delivery pricing resolves an enabled country/currency override, then a per-currency default, then zero. A disabled country override falls through to the currency default. Missing country policy permits checkout. Delivery zones continue to define configured service prices and availability. An explicit standard selection works with the fallback price. Express requires a configured service.

OWNER-only GET and PUT /v1/admin/checkout/defaults manage currency, shippingMinor, an optional freeOverSubtotalMinor and expectedRevision. Revision checks protect concurrent changes and updates are audited. Admin Delivery settings contains currency defaults and optional country rates. A blank delivery amount saves as zero. Tax inputs are removed.

Storefront automatically applies a single delivery service and retains selection when several services are available. Checkout omits the Tax row. Order receipts show positive historical tax amounts. Browser-local Zustand cart behavior and final server price validation with atomic stock reservation remain in place.

Migrations 20261114153000_checkout_default_rates and 20261114160000_remove_checkout_tax_configuration are applied only to the guarded local test database. The second migration follows the owner's tax-removal clarification. Local audit verified 44 applied migrations with 44 matching checksums, zero unresolved failures and zero pending migrations. Both rate tables have no tax_bps columns. Historical order and reservation tax columns remain.

Source changes await commit/push and application deployment. Both new live migrations remain pending. Real external Stripe provider, webhook and worker acceptance remains pending.

### Executed local validation

- Backend build, Prisma validation, type checks and lint passed. Unit tests passed 347, Jest HTTP tests 13, API smoke/contract tests 62, isolated database tests 84 and security tests 67. The final focused Stripe gateway run passed all 9 tests and preserves the existing provider request shape.
- Admin build, type checks, lint and verification passed with 48 unit tests and 25 production-browser tests. Browser coverage includes creating a currency default and editing its delivery amount to blank, which saves zero.
- Storefront build, type checks, lint and verification passed with 57 unit tests and 33 production-browser tests. Tax-free checkout presentation is covered.
- Four real local backend/admin/storefront browser integration tests passed. They cover OWNER default configuration, country delivery pricing, coupon totals, account isolation and reservation recovery.
- OpenAPI has 154 paths and 195 operations. Alignment audit reports 7 MATCH, 15 ADAPTER and zero REVIEW, with 4 audit-tool tests passing.

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


Current hosted Stripe checkout and stock reservation behavior is documented in [the final checkout flow](CART_QUANTITY_AUTOSAVE.md). Its draft-cart, final-reservation and explicit shortage-recovery sections describe the current implementation.


Current combined validation is tracked in [Web validation](WEB_VALIDATION.md). Implementation-time test deferrals and earlier acceptance counts below are historical for their snapshots.

Source delivery: **2026-11-08, IMPLEMENTED / FULL VALIDATION PENDING**. Test code is prepared; automated suites run only in the final integration window under the owner's instruction. Builds and source audits do not certify runtime behavior.

The live User `/checkout` requires customer authentication. Guest items and uncertain cart changes must be resolved in `/cart` first. Saved addresses are fetched from the owned account; the selected address becomes an explicit allowlisted historical shipping snapshot in the existing order API. An address UUID is never treated as an order shipping payload. No delivery address or checkout credential is persisted in browser storage. Explicit preview remains separate.

## State and recovery

1. Select an owned saved address and optional single normalized coupon. Read configured delivery options for that ISO country and the cart's server-owned currency. A zone offers enabled standard/express services; an unzoned configured lane returns the legacy flat option. Unconfigured/disabled lanes fail closed; no FX or invented free shipping.
2. Explicitly request a fresh estimate. Merchandise, discount, shipping, tax and total are server integer minor units. This is neither a stock reservation nor a payable amount.
3. Reserve current stock using a frozen request UUID and selection. Review the actual reserved totals, which may differ from the earlier estimate. The existing hold lasts ten minutes; expiry is displayed and the Backend decides whether it remains active. Release the owned hold before editing a reserved cart or changing destination.
4. Convert the active owned reservation to an unpaid order with a separate frozen request UUID and shipping snapshot. Lost responses retain the exact in-memory request for explicit retry; writes are never automatically replayed. Unloading with an uncertain request warns.
5. Prepare the owned STRIPE_TEST attempt explicitly. Fixed TEST card simulation requires explicit confirmation and Backend TEST flags; a production-hosted showcase additionally requires explicit STRIPE_DEMO_MODE opt-in. No raw card data, client secret, live payment UI or provider configuration is introduced. Preparation, confirming/capturing, awaiting webhook, settled and review states stay distinct. Only the owned order's server `PAID` status displays payment confirmation.

The additive customer-only `GET /v1/checkout/recovery` discovers the newest owned ACTIVE hold and latest owned PENDING_PAYMENT order ID. It uses no-store and projects no address or provider credentials. Hold reads retain the existing atomic expiration behavior. A current active hold takes precedence unless a specific order is open. `/checkout?order=<UUID>` refetches only an owned order, including after reload; another customer's identifier is rejected. Recovery can be refreshed after an uncertain acknowledgement. It is discovery, not an automatic payment/order retry or an exhaustive order-history endpoint.

Checkout writes share the shopping Web Lock. Owner/epoch fences discard delayed responses after session changes. Reservation/order retries reuse exact bodies; duplicate order requests cannot create a second allocation under existing Backend rules. The UI exposes explicit hold release and unpaid-order cancellation; paid refunds remain separate. Payment preparation may be retried for CREATING/READY after reading current server state. TEST completion may be explicitly retried in READY/CONFIRMING/CAPTURING; server leases, attempt limits and reconciliation rules remain authoritative. Awaiting-webhook/review states require status refresh or operator reconciliation, never a locally asserted success.

An expired payment deadline disables TEST actions. Server cancellation/expiry/reconciliation jobs govern allocation release; changing a browser clock is never authoritative. No background scheduler, signed webhook, actual provider call or deployed payment flag is activated by this delivery.

## Admin policies and records

- `/shipping`: only OWNER reads/writes country/currency checkout rates and delivery zones, matching the actual Backend guards. A staff shipping permission does not grant financial-policy administration; the page explains the restriction. Rate PUT uses whole minor units and tax basis points; blank free threshold maps to null, zero remains a valid threshold. Existing rates have no revision field and retain Backend last-write-wins semantics. Zone creates use revision zero; replacements/deletes use the exact current revision. Both standard and express configurations are explicit; deleting a zone confirms that configured flat lanes become the fallback. Zone configuration never implicitly creates a tax lane.
- `/promotions`: current marketing.manage/OWNER gates coupon/campaign server search and pagination, detail, create/replace, disable/pause and private quota counts. Coupon kind is FIXED minor units or PERCENT basis points, with exact currency, gross minimum, nullable caps/quotas, timezone-qualified windows, optional exact category and campaign UUID gates. Blank caps are null; zero is not silently converted to unlimited. Campaigns remain editorial and never auto-apply prices or send messages. Revision conflicts require reading the current server record; uncertain creates are not blindly replayed.
- `/payments`: payments.view/OWNER reads `/v1/admin/reports/payments`, with server pagination, exact currency and attempt-state filters and UTC inclusive-from/exclusive-to windows. Attempted/settled values stay distinct; lifetime refunded exact integer strings are displayed without floating-point conversion. Partial date inputs explicitly retain the server default window. No sample totals, payment mutation, refund success or browser finance aggregation is shown. Other financial/daily/export/report surfaces remain step 7.

Checkout rate list/write now have explicit response DTOs. No existing endpoint/request shape, financial rule, schema/migration, application dependency or release command is changed. The new recovery route is additive.

## Prepared validation

Unexecuted User unit source covers coupon normalization, snapshot allowlists, exact totals and hold/order/TEST eligibility. API smoke source covers discovery schemas, JWT requirement, rate schemas and absent payment/order client authority. Guarded browser source covers real shipping policy/coupon configuration, stale revision rejection, coupon totals, lost reservation acknowledgement with same-request retry, reload recovery after lost order acknowledgement, owned discovery/IDOR, unchanged physical stock, pending payment and cancellation allocation release.

Run these with all prior deferred tests at step 8: frontend unit/auth/preview E2E plus Backend smoke/DB/security and `test:web:integration`. Fixtures use only the existing guarded localhost test DB and fixture-owned records. Actual Stripe TEST/webhook/provider and deployment acceptance remain separate. Current release receipts are historical, not acceptance of this source change.
