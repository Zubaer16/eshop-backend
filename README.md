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

## Documentation

- [Release operations and acceptance](docs/RELEASE_OPERATIONS.md)
- [API automated testing](docs/API_AUTOMATED_TESTING.md)
- [Frontend/backend handoff](docs/FRONTEND_HANDOFF.md)
- [Deployment decisions](docs/DEPLOYMENT_DECISIONS.md)

Historical milestone and patch notes have been removed from the active source tree during documentation hygiene. They are preserved in a **separate history archive outside this repository**. The three owner-held master documents also remain outside all repositories.
