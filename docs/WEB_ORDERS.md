# Web orders, fulfillment and recovery

Current combined validation is tracked in [Web validation](WEB_VALIDATION.md). Implementation-time test deferrals and earlier acceptance counts below are historical for their snapshots.

Source delivery: **2026-11-08, IMPLEMENTED / FULL VALIDATION PENDING**. New tests are written but unexecuted under the owner's policy. Intermediate TypeScript/lint/build and source checks do not establish runtime acceptance.

## Customer flows

The live account links to `/account/orders`, a server-paginated owned history. `/account/orders/<UUID>` reads the owned immutable order/address/line totals, original shipment, return and replacement ledgers, refund history and tracking events. Payment/order status is separate from fulfillment. Pending orders link back to their owned TEST payment status and offer explicit unpaid cancellation; paid orders have no cancellation/refund shortcut.

Live order detail no longer pre-generates demo IDs or rejects canonical UUIDs against preview fixtures. Preview IDs/static parameters remain behind explicit preview mode. Private detail uses the authenticated client; it never caches private rows in shared SSR or creates public order metadata.

Only customers initiate returns. A verified PAID and DELIVERED order exposes canonical line, whole quantity and bounded reason controls. Pending/approved/inspected/restocked returns consume the sold quantity allowance; cancelled/rejected requests release it. Displayed remaining allowance is a hint; the Backend serializes and validates every request. A REQUESTED return may be withdrawn before approval. Return approval/physical inspection/restock/refund are independent states.

`/track` accepts only an authenticated own order UUID, optionally restored from `?order=<UUID>`. It renders the Backend original-shipment/recovery timeline and replacement dispatch identifiers. No public email, human order number or carrier link interpolation is introduced. Unknown and other-customer orders fail through existing ownership guards. Refresh reads current server state; another account never inherits the previous private view.

## Staff operations

Admin `/orders` requires current `orders.manage` or OWNER. Its list uses the actual server pagination and a separate exact UUID lookup/deep link `/orders?order=<UUID>`. **Global free-text/status/customer/date filtering is deliberately unavailable in this version**: existing APIs expose page/limit only. No all-page scraping or filtering one page as if it were the entire dataset. This explicit capability reduction resolves the initial filter gap without changing Backend query/business rules.

Detail shows the authorized historical address and canonical line prices/SKUs. Original fulfillment is one shipment for all lines: verified paid order -> processing -> shipped with bounded plain carrier/tracking identifiers -> physically delivered. There is no generic status setter, split shipment, manual PAID flag or silent finance change. Only the existing unpaid-cancel action closes unpaid allocations. Separate list/detail Refresh controls expose current server state after mutations.

Staff can approve/reject customer return requests, record physical receipt with an explicit RESTOCKABLE/DAMAGED inspection, and separately restock an eligible original SKU exactly once. Staff cannot initiate a return as a customer. Same-SKU replacement authorization requires an inspected return and no conflicting financial recovery. Authorization reserves/deducts no stock; replacement dispatch atomically deducts available original-SKU units. Dispatch/delivery/cancellation use their own lifecycle. A shipped replacement cannot be silently cancelled or restocked; one replacement identity per return remains authoritative, including cancelled history.

Only OWNER reads refund ledgers or approves a positive exact-minor-unit request. Other orders.manage staff never fetch the OWNER-only refund route. The UI does not calculate a financial ceiling; Backend payment-ledger bounds and replacement/refund conflicts remain authoritative. Approval reserves an amount and can remain REQUESTED/PROCESSING/REQUIRES_REVIEW/FAILED. Provider submission is distinct from success. **Only server SUCCEEDED displays refund confirmation.** Stock return is always separate. No worker/provider execution or real refund is triggered during implementation.

## Mutations and privacy

Each keyed transition freezes its UUID and allowlisted payload before sending. Uncertain results keep that same request in memory for explicit retry; no automatic mutation replay or local optimistic ledger/status is used. Unpaid cancellation uses the existing idempotent route contract without inventing a UUID field. An unloading warning protects pending local intent. After reload or revisiting, read server ledgers and reconcile deliberately; pending request bodies are not persisted to browser storage.

An explicit Reconcile action refetches current ledgers before confirmation to discard only the local request; it does not undo any server operation. Acknowledged writes refresh order/return/replacement/tracking/refund records, and read failures block further normal writes until refreshed. Requests serialize per app origin with a Web Lock; every delayed result checks session epoch/subject and component lifetime. Authenticated boundaries remount private state on account/grant changes. Server locks, leases, idempotency, eligibility and exact stock/financial rules remain final authority across browsers and independent apps.

Customer order list, Admin order list and Admin detail now have explicit response DTOs matching existing projections. List schemas do not introduce private address fields or persistence-only request hashes. No endpoint, request payload, Prisma model/SQL migration, financial/inventory rule, dependency or release command changed in this delivery.

## Prepared validation

- Both frontend unit sources: exact refund minor units, canonical action payloads, bounded carrier/tracking fields, return allowance after cancellation/rejection/restock and distinct order status/totals.
- API contract source: typed page/detail projections, JWT requirements, action allowlists, no staff return-initiation route and distinct refund/physical operations.
- Guarded browser source: real User/Admin order routes, lost fulfillment acknowledgement/exact retry, full original shipment, customer withdrawal/new return, inspection before restock, single same-SKU dispatch, reload tracking, cross-customer IDOR, replacement-versus-refund conflict and lost refund approval acknowledgement with one REQUESTED ledger row and no stock change/provider success.

Browser fixture source constructs an explicitly controlled verified-payment ledger/physical-sale snapshot only in the existing guarded local test DB. That fixture is not provider settlement evidence. It was not executed during implementation. Cleanup is restricted to fixture-owned users/products/orders and an unused country/currency lane, with existing test database identity/backup/migration protections.

Run all deferred unit/auth/API/isolated-DB/security/preview and cross-app suites in step 8 and repair failures before acceptance. Actual Stripe/provider/webhook/deployment/restore evidence and a fresh source-bound release receipt remain separate.
