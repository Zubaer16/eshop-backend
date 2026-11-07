# Frontend-to-backend audit — 2026-10-19

**Exact inputs reviewed**

- `kookaburra-admin-full-20261019-170806.zip`
- `kookaburra-storefront-full-20261019-170735.zip`

## Confirmed current state

- Admin is Next.js 15 using browser-local Zustand persisted state (`lib/store.ts`), `lib/fixtures.ts`, and custom components for products, variants, categories, inventory, orders, customers, shipping, promotions, content, staff, and reports.
- Storefront is Next.js 15, using browser-local cart/wishlist and sample catalog. `lib/api/client.ts` is a **dormant** transport with `NEXT_PUBLIC_ESHOP_API_URL` (legacy `NEXT_PUBLIC_KOOKABURRA_API_URL` also works) and `/v1/...` path restriction; no live backend is connected.
- Both contain **draft** contract projections (`storefront/lib/api/contracts.ts`; `admin/lib/compatibility-contract.ts`). They are not generated shared types and do not prove real data parity.
- Storefront's `ApiMoney` uses `{ amountMinor, currency: 'USD' }`; category names, product titles and descriptions currently use `{ en: string }`; variants use `options: Record<string,string>`; nested categories use `parentId`.
- Storefront expects `ApiCartItem` with optional `variantId`, `QuoteRequest` with ISO-address `destination` and `items`, and quote line/total money in minor units. The client must never supply authoritative price or payment state.
- Storefront preview delivery IDs are `standard` and `express`. Example shipping fees and taxes are not authoritative. The `Other country` option deliberately lacks an ISO code and cannot be treated as a valid checkout destination.

## Critical mismatches before data migration

| Topic           | Finding                                           | Required backend response                                                   |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Product ID      | Admin sample `p-101` vs Storefront `p-headphones` | Use new canonical UUID/ULID; explicit import mapping only                   |
| Prices          | Admin and Storefront fixtures disagree            | Never silently choose sample prices; admin edits authoritative after import |
| Variant/stock   | Some products differ in variant count             | Stable SKU and variant IDs, atomic stock/reservations                       |
| Simple products | Storefront drafts use no variant for some items   | Decide explicit DB stock handling without guessing fake IDs                 |
| Categories      | Admin nested, storefront flat                     | Canonical nested categories, multi-category links                           |
| Orders          | Demo orders can lack variant IDs                  | Real orders require actual selected option/snapshot when applicable         |
| Payments        | Admin is simulated; Storefront is preview         | Stripe test webhook verified server-side, idempotency                       |
| SEO/content     | Admin edits are not published to Storefront       | Publication APIs with visibility + safe internal CTA paths                  |
| Security        | Admin role matrix is preview-only                 | Enforce role permissions on the API                                         |

## Endpoint **planning**, not implemented routes

- `GET /v1/products`, `GET /v1/products/:slug`, `GET /v1/categories`
- `GET /v1/storefront/content`, `GET /v1/storefront/config`
- `POST /v1/checkout/quotes`, `POST /v1/orders`, `GET /v1/orders/:id`
- `POST /v1/payments/stripe/webhook` (raw body + signature verification)
- `/v1/admin/products`, `/v1/admin/inventory`, `/v1/admin/orders`, `/v1/admin/media`, `/v1/admin/shipping`, `/v1/admin/promotions`, `/v1/admin/staff`

Do not wire UI actions to these until routes, auth, tests, and generated OpenAPI DTOs exist. Beware that a future webhook may require a raw request body exemption from default JSON handling.

## API prefix choice

Blueprint previously mentioned `/api/v1` while the latest Storefront client **actually uses `/v1`**. Phase 01 deliberately uses `/v1`. Avoid duplicating `/api` or changing the dormant Storefront transport unexpectedly.
