# G9 reporting and activity contract

Status: IMPLEMENTED / FULL VALIDATION PENDING, 2026-11-02. All automated tests deferred to G12 by owner instruction.

## Routes and authorization

All routes use the existing /v1 prefix, authenticated Admin guards and fresh current permission checks; OWNER bypass follows existing policy. Responses are no-store.

| GET route                                   | Grants                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| /admin/reports/financial, /daily, /payments | payments.view                                                              |
| /admin/reports/orders                       | orders.manage                                                              |
| /admin/reports/products                     | payments.view and catalog.manage                                           |
| /admin/reports/customers                    | payments.view and customers.view                                           |
| /admin/reports/inventory                    | inventory.adjust                                                           |
| /admin/activity                             | activity.view                                                              |
| /admin/reports/export/:kind                 | Same grants as the selected report                                         |
| /admin/dashboard/overview                   | dashboard.view; each nested section additionally requires its domain grant |

Export kinds: sales, orders, payments, products, customers, inventory, activity. Unauthorized dashboard sections are null with availability flags and are not queried. Unknown and irrelevant query fields are rejected. Pagination defaults 25, maximum 100; page maximum 100000. Inventory supports current currency/status/product/low-stock filters, not date windows. Activity supports actor UUID, target type and literal search; SQL wildcards are escaped and controls rejected. SQL values are bound parameters.

## Time and money

Date inputs are real YYYY-MM-DD dates, both from/to or neither. UTC [from,to) windows default to 30 days ending tomorrow UTC, include partial today, and allow at most 366 days. Daily/product/customer reports require a single currency; financial summaries group currencies with a 100-currency cap. All reads use bounded RepeatableRead snapshots, one database UTC clock, SET LOCAL TIME ZONE UTC and a 10-second statement timeout (25-second transaction limit). Timeouts return 503; narrow the range. Existing DB defaults remain Asia/Dhaka.

Verified PaymentTransaction.createdAt establishes paid facts for STRIPE_TEST only. Successful refunds require confirmedAt, provider refund identity and matching transaction/order/currency, and are counted independently in their confirmation window. A refund of an older payment can produce negative period net collections. Pending/failed requests do not count. No FX, cost, profit, accounting revenue or real-bank reconciliation is inferred. Aggregate money and quantity sums are exact decimal strings; stored int32 row values remain numbers.

Order report cohorts use order creation date and current status; payment rows use attempt creation date and separately derived ledger collection state. Their lifetime refunded amounts differ from period financial flows. SKU performance uses immutable paid order-line title/SKU/price/discount snapshots, with gross minus line discount as net merchandise. Order-level refunds, tax and shipping are not invented per SKU; refunds do not automatically reverse sold quantities. Customers are current CUSTOMER accounts, including disabled accounts, excluding staff; displayed profile identity is current and metrics are period facts, not lifetime value.

Inventory is a current snapshot of visible SKU balances, excluding hidden parent mirrors for products with variants. It separates physical onHand, reserved and available; physical low stock is onHand <= threshold, including zero. Variant retail price falls back to product price. Retail stock estimates use current prices, not cost/profit; zero and low-stock categories overlap.

## Export and activity boundaries

CSV is capped at 1000 rows and 5 MiB; larger exports fail without silent truncation. It uses explicit trusted columns, UTF-8 BOM, CRLF, quoted cells and formula-leading text neutralization. Exact integer/decimal text is retained; spreadsheet import should treat amount strings as text to avoid automatic precision loss. External spreadsheet transformations/resaves are outside this guarantee. Filenames are server-generated from validated dates; no files or public links are created.

reports.export.prepared is appended before response; audit failure fails the export. This records preparation, not successful download. Activity exposes only ID, nullable actor ID, action, target type/ID and creation date, without joined profile, payload, provider keys or addresses. HTTP provides no activity mutation route; privileged database tamper-proof/WORM storage is not claimed.

## Integration and rollout

Source alignment v1.15.0: 6 MATCH, 16 ADAPTER, 0 PLANNED, 0 REVIEW_REQUIRED. Existing Admin reporting/dashboard/activity are browser-local. Adapters must use canonical UUIDs, exact string amounts, separate currency selectors, fresh grants and exclusive UTC end dates (convert an inclusive UI end date to the next day). Fixture clocks/all-time presets are not backend report windows. No frontend was changed in this batch.

Migration 20261102110000_phase05h_g9_reporting_indexes adds seven ordinary transactional indexes on User, Order, PaymentAttempt, PaymentTransaction, RefundRequest and two AuditEvent access patterns. Production lock timing and representative query plans/load remain release checks. Retention/recovery and operational hardening remain G10/G11. No report query, API or CSV was executed in this batch; behavior requires G12 validation.
