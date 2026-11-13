# Optimistic cart Add and atomic sync — 2026-11-13

> Superseded in part by [quantity autosave and checkout validation](CART_QUANTITY_AUTOSAVE.md): quantity no longer needs submit; cart saves no longer reject insufficient stock. Earlier validation receipts below describe the previous implementation.


Owner approved immediate item/quantity/estimated-subtotal display, background validation, batched rapid additions and an atomic replay-safe Add operation. This supersedes the earlier drawer-only change that waited for confirmation before showing new items.

## Browser behavior

Add uses the already displayed canonical product/variant ID and a display-only preview. The drawer, item, quantity and estimated subtotal update immediately and show Syncing. Preview prices/images are never sent as authority or stored in the canonical CartQuote. Pending totals cannot authorize checkout. A new positive +1 control in the pending card allows rapid additions; consecutive unsent additions for the same product/variant coalesce in a 180 ms window. One batch is sent at a time, and newly queued additions wait behind the in-flight batch. Per-line local quantity remains bounded at 99, with a bounded queue.

Confirmed quotes replace estimates. Definite validation rejections remove the rejected preview and cancel unsent queued additions with a notice. Network/5xx/invalid-response uncertainty pauses the queue and retains the exact request UUID and frozen delta payload. Only explicit Retry resends it. Estimates and speculative header counts are suppressed while an outcome is uncertain, including after a manual cart refresh. Discard requires the existing reconciliation confirmation. Account/epoch changes remove local previews and unsent work; delayed responses cannot populate a replacement account. Closing the drawer is respected through later batch completion. Reload/navigation-away warnings include unsent work.

Existing absolute quantity forms still submit the final entered quantity once through PUT. Confirmed cart fields and final checkout estimates/reservations/orders/payments retain their existing authority and guards. Cart data is not moved into public caches or browser-local price authority. Redis and new dependencies are not needed for this change.

## API additions and rollout

- `POST /v1/cart/items/add`: current customer Bearer session.
- `POST /v1/guest-cart/items/add`: existing X-Guest-Cart-Token capability.
- Body: `{ productId, variantId?, quantity, requestId }`; quantity is a positive **delta** (1..99), requestId is a UUID.
- HTTP 200 returns the existing CartQuote response. Existing PUT routes remain absolute quantities and are unchanged.

The cart row lock covers receipt lookup, cumulative quantity/product/variant/stock/currency/cap/reservation validation, the increment, receipt insertion and returned fresh quote in one transaction. Same cart + request ID + identical parameters does not increment twice; changed parameters with the same key return 409. Replay returns a current quote, not a stale stored price. Guest/customer scopes are distinct and owner-bound.

Existing IdempotencyRecord storage is reused; no migration was added. Receipts carry a 30-day expiresAt timestamp and must be retained for the supported retry window. This change does not add a cleanup scheduler. Existing guest capability lifetime, origin checks, HttpOnly/Secure cookie rules, Web Locks, JWT ownership and server stock/financial authority remain intact.

A customer Add or an existing guest capability needs one Add request with no pre-add cart/product read. A first guest browser request may still create its capability upstream before Add inside the existing same-origin bridge. Guest credentials never enter browser JSON/storage. Deploy Backend before the new Frontend; there is no unsafe fallback from an uncertain atomic Add to a fresh Add or legacy setter.

## Executed validation

Node 24: frontend 63 unit tests and 28 production-browser tests passed, with no retries/skips; typecheck, lint, structural verification and production build passed. Browser regressions cover immediate item display with held responses, no pre-add read, canonical variants, optimistic rollback, batch delta [1,2] producing quantity 3, closed-drawer behavior, uncertain replay with identical IDs, checkout disabled during sync, phone layout and cross-account fencing. Browser writes are intercepted; selected public catalog/media GETs remain read-only.

Backend: 10 focused DTO/quote unit tests, 9 guarded local PostgreSQL cart/guest/checkout/reservation integration tests and web-test types passed. Five concurrent identical requests incremented once; distinct concurrent additions accumulated; mismatched replay, overstock, invalid IDs, ownership and active checkout protection were exercised. Test data was isolated to the guarded local kookaburra_api_test database and cleaned up. No production cart/provider writes occurred. Test/export helpers explicitly disable Stripe showcase mode rather than inheriting a developer setting.

Canonical OpenAPI was regenerated: 204 operations, 198 success schemas and 6 existing schema absences. Integration source audit passed; ordinary alignment audit reports 7 MATCH / 15 ADAPTER / 0 REVIEW_REQUIRED and no missing evidence. The separate strict release gate still rejects P0 ADAPTER classifications by design; no full release/provider/deployment acceptance is claimed. Contract versions: web integration 1.10.0, alignment 1.28.0.

Receipts: ../eshop-user-frontend/test-results/storefront/results.json, screenshot optimistic-cart.png under the rapid-additions artifact folder, backend playwright-api-report. No commit, push, production database change or deployment was performed.
