# eShop Backend

Product name: **eShop**; package name: `eshop-backend`. Existing checkout folders and persisted technical identifiers remain compatible.

Single-tenant, white-label e-commerce REST API built with NestJS, TypeScript, Prisma and PostgreSQL. The API uses the `/v1` prefix and server-side JWT/RBAC controls. Commerce, inventory, payments, fulfillment, media, store configuration, marketing, notifications, email, push and reporting share one modular backend.

## Source structure

Keep features in their own `src/<feature>/` module. Larger modules group related responsibilities into subfolders:

```text
src/
  auth/
    credentials/
    permissions/
    workspace/
  orders/
    fulfillment/
    replacements/
    returns/
    tracking/
  payments/
    providers/
    refunds/
```

Module wiring and core feature files stay at the module root. Keep unit `*.spec.ts` files beside the source they cover. API integration/security tests stay in `api-tests/`, Nest E2E tests in `test/`, and browser tests in `swagger-ui-tests/`. Smaller modules stay flat until grouping improves navigation; a subfolder does not require a new Nest module.

## Project workflow

- Use Node.js **24.11+** and `npm ci`. Set deployment-owned environment variables using `.env.example` as a reference; do not commit actual secrets.
- `npm run check:static`: Prisma generate/validate, TypeScript, Swagger syntax, lint and build (does **not** run the deferred regression suites).
- `npm run alignment:audit`: read-only multi-repo frontend/backend contract audit; Admin and Storefront remain separate client applications.
- `npm run jobs:verify:source`: read-only job coordinator source wiring audit.
- For acceptance, the Node 24 local release runner (`npm run release:local`) runs all configured unit, API, DB, security and Chromium test suites and writes a source-bound receipt. Requires an isolated local PostgreSQL API test database. See [Release operations](docs/RELEASE_OPERATIONS.md).

### Operational safety

Never apply database changes without confirming the exact dev/test database identities, previously applied migration SHA-256 checksums, and separate verified backups. **Do not rename or remove Prisma migration folders or SQL**, even if their historical names mention implementation milestones. Do not run destructive migrations or production credential/provider operations as part of repository cleanup. Financial settlement, idempotency, reservations, staff permissions, and provider retry ambiguity must remain server-authoritative.

### Release state

**Current local release verification passed on 2026-11-07:** all 12 runner steps exited zero, before removal of a temporary convenience command alias. The suite implementations are unchanged; this package-script change invalidates the prior source-bound receipt. See ignored `validation/release-local/receipt.json`; future source changes require fresh evidence. **External release verification remains pending:** the reviewed provider, database restore, deployment and security evidence manifest is not present. Local PASS does not replace the separate `npm run release:gate` decision.

## Web integration

Steps 1–2 are complete: live User/Admin authentication, persistent sessions and route permissions. Catalog/media/inventory source is implemented with full runtime validation deferred; account/cart/wishlist/customer-directory source is also implemented with final runtime validation deferred; checkout/shipping/tax/promotions/TEST payment source is now implemented with full validation deferred. Run `npm run integration:audit`, follow [the integration flow/gap map](docs/WEB_INTEGRATION.md) and see [web authentication](docs/WEB_AUTH.md) for configuration and focused test commands. Unconnected business screens remain unavailable in live mode; explicit preview is separate.

## Documentation

- [Release operations and acceptance](docs/RELEASE_OPERATIONS.md)
- [API automated testing](docs/API_AUTOMATED_TESTING.md)
- [Web catalog/media/inventory](docs/WEB_CATALOG.md)
- [Web account/cart/wishlist/customers](docs/WEB_SHOPPING.md)
- [Frontend/backend handoff](docs/FRONTEND_HANDOFF.md)
- [Deployment decisions](docs/DEPLOYMENT_DECISIONS.md)

Historical milestone and patch notes have been removed from the active source tree during documentation hygiene. They are preserved in a **separate history archive outside this repository**. The three owner-held master documents also remain outside all repositories.

## Checkout source delivery (2026-11-08)

Customer checkout uses owned saved-address snapshots, configured country/currency delivery and coupon estimates, expiring stock holds, idempotent unpaid order creation and explicit TEST payment actions. Reload/lost responses recover through owned server discovery. Admin policies follow OWNER-only checkout rate/zone guards, marketing revision/limit rules and payment-report permissions. No live card details or browser PAID flags. Test code is prepared; suites run together at final integration validation. Typecheck, lint and builds are the intermediate checks. See [Web checkout](docs/WEB_CHECKOUT.md).

## Order operations source delivery (2026-11-08)

Owned history/detail, unpaid cancellation, customer return requests/withdrawal and authenticated UUID tracking are connected. Admin uses server pagination/exact UUID lookup, one-shipment fulfillment, inspection/restock, same-SKU replacements and OWNER-only refund request/history. Refund approval is not provider success or stock return; uncertain keyed actions retain UUID/body for explicit retry/reconciliation. Typecheck/lint/build are intermediate checks; all automated suites remain deferred to final integration validation. See [Web orders](docs/WEB_ORDERS.md).

## Store/workspace source delivery (2026-11-08)

Step 7 source connects published homepage/collections/policies/branding and OWNER settings/staff/templates, current-grant dashboard/reports/audit/CSV, owned inbox/preferences/browser push and rich campaign/operations panels. Firebase 13.2.0 is pinned and lazily used only with public app/VAPID configuration and explicit prior browser consent. Auth credentials remain in the existing memory/HttpOnly session design. Actual Firebase/SMTP/FCM/provider/deployment acceptance remains separate. All automated suites are deferred to step 8; current type/lint/build/schema audits are intermediate checks. See [Web workspace](docs/WEB_WORKSPACE.md).
