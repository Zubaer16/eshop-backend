# KOOKABURRA — G3/05B-5 Store Operations + Delivery Zones

**Base:** `kookaburra-backend-full-20261030-232707.zip` (443 entries). G3/05B-1 Profile, 05B-2 Content, 05B-3 Media Branding and 05B-4 public Bootstrap are already present: **do not reapply them**.

**Current status (2026-11-02): LOCALLY ACCEPTED for owner-approved v1 scope.** This is local Backend G3 acceptance, not G12 Backend RC, production readiness or live browser-app integration.

**2026-11-02 local workflow update:** Source and the 05B-5 migration are already installed locally. Codex edits this working tree directly; no patch archive/application step is required. Both local DBs have 31 applied migrations with checksums matching source. Fresh verified backup archives and validation logs are held outside this repository in the owner's Master Docs `validation/2026-11-02-g3/` folder. Current checks: 197 unit + 13 Nest E2E, typecheck/lint/build, 50 API smoke, 50 real-DB, 52 security, focused Chromium 1 and full Chromium 29 PASS; alignment 2 PASS, 0 skipped. Owner expressly approved the existing v1 boundaries. See `docs/PHASE05B5_LOCAL_VALIDATION.md` for acceptance evidence and exclusions.

## Backend contracts

- `GET /v1/store/operations`: public allowlisted locale, display currency, strict hex accent/theme and presentation toggles; explicit `guestCartEnabled: true`, `guestCheckoutEnabled: false`. Customer JWT required for quote, hold and order; guests must merge cart after login. No public order/payment guest path.
- `GET/PUT /v1/admin/store/operations`: OWNER-only, revision-checked, audited single-installation settings. Safe HTTPS storefront/Admin origins are **metadata, not a CORS grant**. `deploymentCorsOrigins` is read-only from `CORS_ORIGINS` env; changes require deployment config and smoke. `orderPrefix` is reserved for eventual human-readable order reference presentation; canonical order IDs remain UUID and existing history is unchanged. `displayCurrency` is display-only, not an FX conversion or cart-currency override. `showWishlist`/`showPolicies` are UI presentation hints; endpoints remain backend-authorized.
- OWNER `GET/POST /v1/admin/checkout/zones`, `PUT/DELETE /v1/admin/checkout/zones/:id`: currency-scoped named zones, unique ISO-alpha-2 country assignments, exactly `standard` and `express` services with integer minor-unit rates, inclusive free-shipping threshold, enabled flag, ETA note. Concurrent edit revision and duplicate country conflicts are `409`. No arbitrary province/postal tax or actual carrier-ETA claim.
- Existing OWNER `GET/PUT /v1/admin/checkout/rates` remains authoritative for country + **cart currency** enabled lane and tax in **basis points** (Admin preview percent -> bps adapter later). The legacy flat-rate path still works when no zone is configured and deliveryKind is omitted; if a zone _is_ assigned, its selected enabled service overrides only shipping. Disabled assigned zones **fail closed**, not fall back. Explicit selection without a zone returns `422`. No cross-country or FX fallback.
- Customer JWT `GET /v1/checkout/delivery-options?countryCode=US` and optional `deliveryKind: "standard"|"express"` on `POST /v1/checkout/estimate` and `POST /v1/checkout/reservations`. Existing clients omitting deliveryKind continue using standard for configured zones, legacy flat rate otherwise. New `deliveryKind` is an immutable nullable snapshot on holds/orders; old records remain null. Pricing/stock guards, payment/refund flows are unchanged.
- `GET /v1/store/bootstrap` remains unchanged (`schemaVersion:1`, Profile, Content, Branding), preserving existing tests/contracts. Frontends may fetch Store Operations separately during their integration phases.

## Additive Prisma migration

`20261030234000_phase05b5_g3_gate_shipping_operations`: create `store_operations`, `delivery_zones`, `delivery_zone_countries`, `delivery_zone_services`; enum `DeliveryKind`; nullable delivery kind snapshots on `checkout_reservations` and `orders`. Previous migrations untouched, no destructive reset/backfill, existing amounts unchanged. Before migrate, verify DB names (`kookaburra-api-dev` and isolated `kookaburra_api_test`) and take independent backups.

## Tests and acceptance

New Jest validation (`store-operations.dto.spec.ts`, `delivery-zones.dto.spec.ts`), API Swagger smoke, isolated PostgreSQL quotes/owner CRUD/revision/legacy compatibility/reservation/order amount snapshots, security/permission and real Swagger Chromium Try it out → Execute. Existing checkout, reservations, orders, payments, returns, media and complete visual suite must still PASS. Do not disable or skip tests. Full local/test DB and browser evidence must come from Windows. Provider/deployment acceptance remains separate G11/G12.

Use at backend root (PowerShell):

```powershell
# Direct local development: verify DB identities/backups before any new migration.
# Existing 05B-5 migration is applied; do not reapply an overlay or rewrite SQL.
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run db:status
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:store-gate
npm run test:api:visual:checkout
npm run test:api:visual:reservation
npm run test:api:visual:orders
npm run test:api:visual:store-bootstrap
npm run test:api:visual:all
$env:KOOKABURRA_ADMIN_DIR = 'C:\Users\zubaer.ahmed\Desktop\git\kookaburra-admin'
$env:KOOKABURRA_STOREFRONT_DIR = 'C:\Users\zubaer.ahmed\Desktop\git\kookaburra-storefront'
npm run alignment:audit
npm run alignment:test
```

### Frontend integration notes (no frontend patch)

Admin `shipping.tsx` currently models country names and dollar decimals; resolve to ISO country IDs and minor units _explicitly_, never copy preview pricing or country `Other country` into server DB. Translate Admin tax percent to `taxBps` after an explicit country+currency lane selection. Storefront `standard`/`express` maps directly to the new `deliveryKind` values; use live `GET /v1/checkout/delivery-options`, then pass the same selected kind to estimate and reservation. Checkout remains JWT customer-only. Do not set arbitrary CORS/domain from the browser. None of the web UIs are now live-integrated.

**Remaining release conditions:** G3 local PostgreSQL/Chromium evidence, backups and explicit owner v1 scope approval are recorded. Actual deployment-origin allowlist smoke remains G11; region-specific tax automation, guest order/payment checkout and actual carrier-service integration are not certified by local zone quotes. G1 is also locally accepted for its approved limited scope; G2 waits for G7 actual email delivery. G12 remains NOT ACCEPTED.
