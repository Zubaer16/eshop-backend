# G4 promotions and coupons — implementation and alignment

Status: LOCALLY ACCEPTED for documented v1 scope (2026-11-02). Current local working tree; no overlay archive. G1/G3 approved v1 scope remains unchanged.

## Source alignment

Reviewed current Admin: components/admin/promotions.tsx, lib/types.ts, lib/merchandising.ts; Storefront: components/checkout/checkout-client.tsx, lib/checkout-preview.ts and lib/api/checkout-alignment.ts. Admin coupon fields (code, percent/fixed, minimum, cap, usage, dates, category, enabled) and separate campaign editor are covered by backend rules. Storefront has no functional coupon execution; its client-calculated/draft checkout remains untrusted. Browser adapters and screens are integration work, not implemented here.

| Existing preview field                            | Backend contract / required adapter                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kind percent / fixed and decimal value            | PERCENT value = integer basis points (10% -> 1000); FIXED value = integer minor units. Currency explicit for both.                                                |
| minimumUsd / capUsd                               | minimumSubtotalMinor / maximumDiscountMinor; preview cap 0 -> null (unbounded), never 0. Minimum checks gross cart merchandise subtotal.                          |
| limit 0                                           | usageLimit null = unlimited. Optional perCustomerLimit has the same null convention.                                                                              |
| category scope                                    | categoryId null = all; otherwise canonical category UUID and exact membership, no descendant inference.                                                           |
| date-only start/end                               | Explicit ISO timestamps with timezone. Start inclusive; end exclusive. Decide timezone/end-of-day mapping in UI; never silently parse a local date as UTC.        |
| campaign Draft/Scheduled/Active/Paused            | DRAFT/SCHEDULED/ACTIVE/PAUSED, revision checked; active/scheduled require both timestamps. Effective window is computed from DB time, without an in-memory timer. |
| campaign description (“Goals and campaign notes”) | Admin-only notes; omitted from public summaries. Public G5 copy is separate content work.                                                                         |
| preview Remove                                    | Revisioned soft-disable coupon / pause campaign, preserving identity, associations and financial history.                                                         |
| checkout preview request { destination, items }   | Current authenticated cart-based estimate/reservation accepts countryCode, optional deliveryKind and optional single couponCode. No client totals/items override. |

## REST / permissions

- Staff JWT + marketing.manage or OWNER: GET/POST /v1/admin/promotions/coupons and /campaigns; GET/PUT/DELETE on each /:id. Creation expectedRevision 0; updates current positive revision. DELETE uses query expectedRevision and preserves history.
- GET /v1/admin/promotions/coupons/:id/usage: active quota claims, no customer/order PII.
- Public GET /v1/promotions/campaigns: bounded pagination, only effective ACTIVE/SCHEDULED summaries (id/title/slug/start/end), no notes/codes/usage/revisions; Cache-Control no-store.
- Single couponCode on POST /v1/checkout/estimate, POST /v1/checkout/reservations and GET /v1/checkout/delivery-options. Trim/uppercase normalization; unknown fields, arrays, null codes and stacking rejected.
- Coupon windows/currency/minimum/category/campaign/usage are revalidated server-side. Unknown/unavailable/ineligible codes return generic 422.

## Pricing and immutable history

subtotalMinor and lineTotalMinor remain gross merchandise amounts. Additive discountMinor, couponCode and couponSnapshot fields record the discount; line discounts are also saved on reservation/order lines. Order line netLineTotalMinor = lineTotalMinor - discountMinor. Total = subtotal - discount + shipping + tax.

Percentage rounds half up once; fixed and percent discounts cannot exceed eligible merchandise or an explicit cap. Exact integer largest-remainder allocation conserves every minor unit, with canonical cart-line ID tie-breaks. Tax and the existing free-shipping threshold use discounted merchandise. No stacking, FX, automatic catalog sale-price change or automatic tax-compliance claim.

Quote is read-only and never promises quota/stock. Reservation serializes cart -> coupon -> optional campaign shared lock -> inventory, and atomically writes stock hold, immutable rule/line snapshots and a unique reservation-linked redemption. Exact same request/code retries return that hold without another claim; changed code under the same request ID returns 409. Coupon/campaign edits or disabling after a hold do not reprice its immutable snapshot. Order copies that snapshot rather than recalculating it. Zero-total coupon reservations return 422; no zero-payment PAID flow is introduced.

## Quota / payment safety

Capacity counts unexpired ACTIVE holds plus CONSUMED reservations linked to PENDING_PAYMENT or PAID orders. Coupon row locking serializes the last usage slot across customers. Released/expired holds and cancelled/expired unpaid orders stop consuming capacity. Expired holds stop consuming coupon capacity even before stock cleanup runs; physical stock still follows the existing safe reservation cleanup rules. Pending payment orders count until actually closed, preserving provider reconciliation safety.

Paid usage remains consumed after a refund; refund success never restocks. Existing payment preparation and verified settlement use the discounted immutable order.totalMinor; the refund ceiling remains that settled amount. No external provider behavior is fabricated.

## Migration and local recovery record

- 20261102060000_phase05c_g4_promotions_coupons: additive campaign/coupon/redemption tables, enums, nullable snapshots and default-zero discounts; old records preserve amounts.
- 20261102063000_phase05c_g4_discount_order_integrity: atomically evolves the existing orders_amount_bounds constraint to subtract discount while retaining nonnegative/bounded values and total equality. Applied historical migration files are unchanged.
- Fresh dev/test backups and matching applied migration checksums verified before each migration.
- First new migration attempt failed from a draft SQL table-closing omission. Transaction rollback was directly confirmed (new tables/columns absent), failure retained and marked rolled back with Prisma; corrected new migration then applied to both DBs. Initial DB run caught the old gross-total constraint (53 passed / 2 failed); the second migration corrects it without weakening money validation.
- Raw logs, SQL review/recovery evidence and backup hashes live outside the repository: C:\Users\zubaer.ahmed\Desktop\KOOKABURRA-V2-MASTER-DOCS\validation\2026-11-02-g4.

## Operational handoff

Both databases now have 33 finished applied migrations matching source checksums, with the first failed-and-rolled-back draft attempt preserved in the dev migration journal. No unresolved failures. Use roll-forward corrections; do not drop coupon/ledger tables or rewrite financial snapshots to roll back a binary. A deployment rollback must understand existing discounted orders. Restore rehearsal and external provider/deployment acceptance are G11 work.

## Acceptance

Current full check PASS: 220 unit + 13 Nest E2E; smoke 51, real PostgreSQL DB 56, security 54 and focused Chromium 2 PASS. Full Swagger Chromium regression 31 PASS (19.7 minutes), 0 failed, no retries. Alignment v1.10.0: 6 MATCH / 11 ADAPTER / 0 PLANNED / 0 REVIEW_REQUIRED, 2 tests PASS (0 skipped). G4 is LOCALLY ACCEPTED for the documented v1 rules and limits; current source hashes and raw logs are retained in the evidence folder. G2 actual email delivery remains G7; G5 content, G11 external/deployment/restore and G12 RC are separate.

Next: G5 content/merchandising (banners, homepage sections, curated collections and safe media/CTA publishing) after reviewing both current UIs. G2 delivery acceptance remains with G7.
