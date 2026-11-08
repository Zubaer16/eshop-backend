# Web catalog, media and inventory

Status: **IMPLEMENTED / FULL VALIDATION PENDING**. The owner requires test code alongside implementation and all automated test execution after the remaining implementation steps. No new unit, API, DB, security or browser suite was executed for this delivery. Builds, typechecks, lint and source/contract audits are separate evidence.

## Connected surfaces

Admin `/categories` reads the real hierarchy and supports create/edit/delete, canonical slug, parent, description, color, sort order and navigation visibility. Deletion/cycle/reference rules stay on the server. Hiding a category does not unpublish its products.

Admin `/products` uses server title search, category/status filters and real pagination. It supports scalar English fields, all canonical category UUIDs, exact currency/minor-unit prices, compare-at price, tags/badges, initial stock, edits and archive. ACTIVE, DRAFT and ARCHIVED remain distinct. Archiving warns that gallery references are detached and unreferenced media enter retention cleanup. It is not physical deletion of order history.

Product details manage size/color variants and nullable price overrides; blank inherits the base price and zero remains zero. Existing stock cannot be edited through product/variant PATCH. Converting a simple product to variants requires zero base stock. Zero-stock draft variant deletion can still fail when inventory/order history protects it. The editor preserves existing currency and creates new products in USD; it performs no FX conversion.

User `/categories`, `/shop` and `/product/[slug]` use public ACTIVE-only APIs. Header/footer categories come from the public category API. There is no live fixture fallback. Product metadata and unknown slugs use the real public API; preview static slugs are generated only in explicit preview mode. Public reads are no-store, refresh on focus/visible intervals and have explicit loading/empty/error/not-found states. Public requests are independent of private logout cancellation.

Shop query maps `q` to server title search, category to canonical slug, explicit tags, stock, newest/base-price order and bounded pagination. Optional Backend `currency` filtering makes USD price filters unambiguous. Exact decimal inputs become integer minor units. Legacy under-price presets 0/1/2 map to USD 25/60/120 caps; stock=1 maps to true; featured maps to a visibly labeled Newest sort. Synthetic fixture groups and global SKU/description search are not invented. Product/variant availability is a display hint; checkout must revalidate stock and price.

Product galleries and explicit variant selection use actual media/variant IDs and effective prices. Cart/wishlist controls are now implemented by the account/cart delivery described in WEB_SHOPPING.md; checkout remains pending in step 5. The live header cart action navigates to its pending page instead of opening an unmounted preview drawer.

## Verified media

Admin `/media` and the product gallery editor require current `catalog.manage`, matching existing Backend guards. All staff may read catalog/inventory; their write controls follow current server grants. Media permissions are not widened for marketing staff.

New additive `GET /v1/admin/media` lists only the current configured namespace. It defaults to ACTIVE, supports explicit lifecycle status and exact asset UUID search, page 1–10000 and limit 1–100. There is no stored original filename to search. Responses allowlist ID, status, verified public URL, MIME, size and dimensions; no object keys, provider credentials, upload token or storage internals.

The upload flow signs through the API, performs the returned provider POST multipart or PUT binary instruction with its exact headers, then verifies on the server. Storage transfer never includes API bearer/cookies and rejects unsafe destinations/secret headers, expired instructions and redirects. Ambiguous upload outcomes retain the same instruction; users can verify an existing upload before repeating it. Verification can be retried without creating a new asset. Provider-disabled errors stay errors.

Gallery drafts support up to six verified canonical IDs, cover ordering, alt text, reuse and explicit save. Raw image URLs cannot replace media IDs. Removing references or scheduling deletion uses existing server reference checks and seven-day retention; it does not claim immediate provider deletion. Deletion-job operation panels remain later operational work. Some disk assets have no public preview until attached to a publicly visible resource; the library shows an honest unavailable-preview state.

## Inventory and retry behavior

Admin `/inventory` supports server pagination, exact product UUID and physical low-stock filtering. Each row distinguishes physical, reserved and available quantities and the configured threshold. No global totals are computed from one page. Read-only staff can inspect balances/movements; `inventory.adjust` is required for writes.

The selected balance UUID is the adjustment identity. Signed units, server-supported reason and note produce one UUID request key. After an uncertain response the payload is locked; explicit Retry sends the same UUID/body. History and the balance can be refetched for reconciliation. Confirmation clears the pending key and refetches authoritative data; replay confirmation is distinct from a new stock change. No mutation automatically retries after 401/timeouts. Closing the dialog is blocked while a request remains unconfirmed; unloading warns. Discarding a local request requires an explicit reconciliation warning. Pending drafts are in memory and should be reconciled before deliberately leaving the app.

Threshold updates use their own endpoint. Movement history is append-only. Existing Backend reservation/negative-stock/int32/idempotency checks remain authoritative.

## Contracts and deferred tests

Catalog/category/variant mutation, gallery/deletion acknowledgements and inventory balance/movement/adjustment responses now have explicit DTO schemas. Existing endpoints remain `/v1`; the media list and optional currency filter are additive. No Prisma schema/migration change, provider activation, dependency addition or `release:*` change.

Prepared tests cover decimal precision/currencies/bounds, canonical IDs, query mapping, category cycles, safe image URLs, upload methods/headers/expiry, read/write access, currency/public status filtering, media namespace/pagination/privacy/RBAC, public-read cancellation and API response contracts. Cross-app browser code prepares category/product/variant/upload/gallery/publish, checks the same User product UUID/price/image, simulates a lost stock-change acknowledgement and same-key retry, checks public availability after adjustment and 404 after archive. A failed-read scenario rejects fixture fallback.

When the owner-approved final test window opens:

- Frontend `npm run test:auth` covers the auth foundation; `npm run test:unit` includes new catalog/upload/access cases. Existing `test:e2e` commands remain explicit-preview regressions.
- Backend `npm run test:web:integration` runs all guarded real cross-app browser specs, while `test:web:auth` remains auth-only. New API files join existing smoke/DB suites. Test source compilation uses `npm run test:web:auth:types`, which runs only `tsc`.
- The guarded web runner permits only isolated localhost `kookaburra_api_test`, pins both frontend API/app origins and configures a unique disposable disk-provider root. It clears disk/backend secrets from frontend child environments and removes only its generated temp root after servers stop. Test fixtures clean their own rows/events. No production provider is needed for this controlled flow.

Current source inventory: 18 User + 18 Admin pages, 199 operations on 155 paths; 187 success schemas present, 12 absent for later owning features/triage. Schema presence and prepared tests do not prove runtime acceptance. Existing auth acceptance records remain historical for their tested snapshots. The final source-bound release and actual external-provider/deployment evidence remain separate.
