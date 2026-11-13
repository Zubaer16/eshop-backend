# Backend cart intent and quantity autosave and checkout validation — 2026-11-13

## Live hosted checkout migration applied - 2026-11-13

Owner explicitly authorized migration against the live URL in Backend .env. Prisma used DIRECT_URL for the Supabase postgres database. Preflight verified 40 applied migration checksums and zero unresolved failures, with only 20261113170000_hosted_checkout_session pending. The command npm run db:deploy applied that migration successfully.

Post-migration db:status reports the schema is up to date. The read-only audit verifies 41 applied migrations, 41 matching source checksums, zero unresolved failures and zero unapplied source migrations. Independent read-only catalog queries verify the four nullable PaymentAttempt checkout columns, their declared types/lengths, and the valid unique payment_attempts_checkout_session_id_key index.

The live database migration is complete. Application changes and the migration source remain local and await commit/push. Stripe provider, webhook/worker and application deployment acceptance remain pending. Credentials were kept private.


## Final stock reservation and hosted Stripe Checkout - 2026-11-13

The storefront reads and saves carts with `view=draft`. Draft projections select product identity, variant and price display fields and return `stockChecked: false` with `availableQuantity: null`. The cart UI calculates line amounts and estimated subtotals immediately and keeps numeric entry plus minus/plus controls. The explicit live quote API supports existing callers. Delivery options and preliminary estimates use draft product data. Inventory validation and allocation happen together when the customer chooses Continue to Stripe Checkout.

`POST /v1/checkout/start` accepts a frozen UUID, country/service/coupon and shipping-address snapshot. It validates the owner, locks all inventory balances in sorted order, rereads available quantities, reserves the requested units transactionally, creates one owned order and prepares a Stripe TEST hosted Checkout Session. Request replay keeps the same reservation, order and Stripe idempotency key. Stripe calls run after database transactions have committed. Server price, discount, shipping and tax snapshots determine the payment amount. The hosted page presents those totals for payment.

A 409 `INSUFFICIENT_STOCK` response includes itemId, productId, variantId, title, SKU, requestedQuantity and availableQuantity for each affected line. The UI presents the requested/available quantities and explicit Update quantity to N and Remove item actions. A zero-availability item offers removal. Cart saving finishes before the next checkout attempt. Network uncertainty retains the original checkout payload for explicit retry. Account changes fence delayed responses, and cart controls pause while checkout starts.

Owned session resume, cancellation and reconciliation use `/v1/checkout/orders/:orderId/session`, `/cancel` and `/reconcile`. Cancellation expires the Stripe Session and verifies its resulting state before releasing the allocation. Failed card attempts and expired sessions are discovered by the payment reconciliation worker and release their unpaid allocation. A payment that wins a cancellation race keeps its allocation. Signed `payment_intent.succeeded` receipts plus a verified provider amount/currency/order bind settlement to the order. Settlement atomically reduces on-hand and reserved stock exactly once. The success return page refreshes server status, with bounded polling while confirmation is pending.

Hosted sessions use a 31-minute payment window, allowing the Stripe API's minimum 30-minute expiry and a creation margin. Existing reservation-to-order transfer keeps allocation during the payment window. The server keeps a reconciliation allowance for delayed receipts. The payment worker verifies session expiration before allocation release. Frozen create retries follow the existing 22-hour provider idempotency safety window, with unresolved older attempts routed to payment reconciliation review.

Stripe documents manual expiration and the 30-minute to 24-hour session expiry range. [Stripe inventory and session expiration](https://docs.stripe.com/payments/checkout/managing-limited-inventory?ui=full-page)

### Deployment setup

Apply migration `20261113170000_hosted_checkout_session` with `npm run db:deploy` before deploying Backend. Deploy the updated Backend, then User Frontend. The migration adds nullable hosted-session identity, URL, expiry and return-origin fields to PaymentAttempt. Return origins use the configured CORS allowlist. The existing Stripe TEST key, signing secret, `STRIPE_TEST_ENABLED`, `STRIPE_TEST_CHECKOUT_ENABLED`, and production showcase configuration govern this implementation. Credentials stay deployment-owned.

Run the existing `payments.reconcile` job lane regularly, with the reservation/order expiry lanes configured for abandoned checkout recovery. The CLI `npm run payments:reconcile` also synchronizes hosted sessions before reconciling signed receipts. The Stripe webhook destination must deliver `payment_intent.succeeded` events. Verify these settings and a real Stripe sandbox checkout on the deployment before accepting the hosted flow as deployed. Live-key support is outside the current repository's Stripe TEST configuration.

### Executed validation

Frontend 66 unit tests and 38 production-browser tests passed, with zero retries/skips. Build/type validation, lint and structural verification passed. Browser regressions cover the 12-versus-10 recovery message, suggested update and removal, a zero-stock line, frozen retry before redirect, Stripe success awaiting server confirmation, cancel return, account switching, plus/minus and typed autosave, and phone layouts. The 390px shortage screenshot was visually inspected. Browser writes and Stripe navigation were intercepted.

Backend 21 focused gateway/quote/jobs/cancellation unit tests and 10 guarded local PostgreSQL cart/checkout/reservation tests passed. The new database scenario exercises concurrent final stock holds, replay after a lost provider response, ownership, changed-payload rejection, cancel-versus-success behavior, failed/expired session release and exactly-once signed settlement. Stripe provider behavior is simulated. The migration was applied to the guarded local test database. The live migration was applied and verified on 2026-11-13. Actual Stripe provider and application deployment acceptance remain pending.

Source alignment audit reports 7 MATCH, 15 ADAPTER and 0 REVIEW_REQUIRED. All 4 alignment tooling tests passed. Integration contract is 1.12.0 and alignment contract is 1.30.0. Canonical OpenAPI contains 208 operations and 202 declared success schemas, with 6 existing absences. The strict release policy's P0 ADAPTER condition remains pending. This implementation and the preceding quantity-control UI follow-up are local and await commit/push.


Quantity changes update the line amount, estimated subtotal and header count immediately using the displayed unit price. There is no Update quantity button. Valid 1–99 absolute targets autosave after 350 ms of editing; later unsent targets replace older targets for the same owner/line. One cart write runs at a time. Inputs remain editable during normal quantity saves, and older acknowledgements cannot replace the latest draft. Stable line keys preserve focus. Blank/invalid input is not submitted and restores the last valid quantity on blur.

Definitive validation failures restore the confirmed display and show an error. Network/5xx/invalid-response uncertainty pauses the queue: explicit Retry sends the frozen absolute quantity before the latest queued target. Checkout, remove/clear/merge and other conflicting writes wait for saves; account/epoch changes cancel unsent targets and reject late responses. Navigation-away warnings include unsent quantities. Add keeps its existing request-ID idempotency and positive-delta queue.

Backend Add, absolute quantity save and guest merge now store cart intent without rejecting insufficient stock. Shared selection validation no longer reads inventory or price: it checks product existence/publication and the selected variant relationship. Authentication, ownership/capability, UUIDs, quantity/line limits, currency separation, row locks, active-reservation protection and idempotency remain. Checkout estimate, reservation and order still independently use current database price and available inventory; browser amounts cannot authorize payment. UI availability remains an informational hint.

API routes, request bodies and CartQuote response schema are preserved. **Existing cart read/mutation responses still project live informational price/stock** for compatibility; this change removes stock acceptance checks from saves, not every database price/inventory read. No additional pre-save quote/product request is made by the browser. The cart displays all line amounts as an estimated subtotal, separate from the canonical quote's available-items subtotal. No schema migration, Redis or new dependency.

Supersedes the stock-rejection and manual quantity-submit behavior in the earlier atomic Add documentation. Backend must be deployed before the updated frontend behavior is used. Owner authorized committing and pushing this follow-up on 2026-11-13. Push receipts are recorded in the three master documents.

## Final local validation

Frontend: 64 unit tests and 32 production-browser tests PASS, zero retries/skips. Production build/type validation, lint and structural verification PASS. Browser cases include guest/account immediate quantity totals and counts, edits during a held response, serialized targets [2,5], definitive rollback and uncertain retry [2,2,5]. Existing Add, auth/account fencing, public rendering/media and responsive design regressions also pass. Final browser receipt: `test-results/storefront/results.json` in the frontend repository.

Backend: production build, lint, web-test typecheck and Swagger syntax validation PASS. All 9 guarded local PostgreSQL cart/guest/checkout/reservation integration tests PASS. Out-of-stock customer/guest Add and absolute updates save successfully; checkout still rejects insufficient stock, current-price estimates remain authoritative, and reservation/replay/ownership tests pass. Guest overstock merge now succeeds while mixed-currency merge still rolls back. Database writes were confined to the guarded local test database; browser writes were intercepted.

Canonical OpenAPI regenerated. Integration source audit, ordinary alignment audit (7 MATCH / 15 ADAPTER / 0 REVIEW_REQUIRED) and all 4 alignment tool tests PASS. Web integration contract 1.11.0 / alignment 1.29.0. Existing strict release policy rejects P0 ADAPTER classifications; no full release/provider/live deployment acceptance is claimed. Owner authorized committing and pushing both repositories for this follow-up. All three master documents were updated.
