# G5 content and merchandising

Status: IMPLEMENTED / FULL VALIDATION PENDING (2026-11-02).

The backend now persists revisioned banners and ordered featured collections. Both current frontend repositories were inspected; the UI layout, highlights and category tiles remain presentation concerns. This is a bounded merchandising domain, not a generic page builder.

## Contracts

All routes use /v1. OWNER or current marketing.manage staff can GET/POST /admin/store/banners and /admin/store/collections, and GET/PUT/DELETE their /:id resources. Lists accept page, limit (maximum 50) and optional status. Create uses expectedRevision=0; replacement uses the current positive revision. DELETE archives with expectedRevision in the query. Stale changes return 409. Each mutation records audit and store.content.changed outbox metadata atomically.

Public GET /store/homepage returns schemaVersion=1, an opaque SHA-256 content fingerprint, banners, collections and truncation flags. GET /store/collections/:slug returns an effective published collection or 404. Responses use no-store. The fingerprint covers safe public data, including changing product cards; it is not an Admin write revision.

DRAFT, PUBLISHED and ARCHIVED are persisted. PUBLISHED becomes effective at inclusive startsAt and stops at exclusive endsAt, evaluated with the database clock; null bounds are unbounded. Reads need no publishing cron. Ordering is position then UUID; collection membership preserves explicit product order. Only ACTIVE products are public, and collections without any ACTIVE products are hidden. Publishing requires all selected products ACTIVE. Subsequent product archival filters public membership without rewriting editorial history.

Homepage limits: 20 banners, 12 collections, 8 product cards per collection. Collection detail includes at most 50 members/cards. Truncation flags identify bounded responses. Cards expose canonical IDs, actual integer minor-unit price/currency and hasVariants; availableQuantity is an advisory on-hand minus held-stock hint, never a checkout guarantee. Checkout remains price/stock authority. No variant IDs, internal SKU, audit, provider keys or staff fields are projected.

## Media and link safety

Banners accept verified Media Library UUIDs, never arbitrary image URLs. Text-only banners may use null imageMediaId. Images require accessible namespace, verified raster metadata and meaningful alt text. Pending deletion can be cancelled only while the deletion job is PENDING under a media row lock; PROCESSING assets are rejected. All draft and published references protect shared media from cleanup. Archive detaches the banner image atomically; normal reconciliation/retention handles unreferenced media. Disk bytes become public only while attached to an effective published banner or another existing public product/brand reference. Cloud/CDN URLs retain provider cache/access semantics; this does not make previously shared external URLs private.

CTA destinations are allowlisted internal store paths. Absolute/protocol-relative URLs, traversal, backslashes, controls, redirect parameters and double encoding are rejected. Only /shop accepts category/tag/sort/page/q queries. Public text rejects markup and control characters. Public projections recheck link/image safety.

## Frontend adapters still required

| Existing frontend field                      | Backend mapping                                                 |
| -------------------------------------------- | --------------------------------------------------------------- |
| Admin enabled / Storefront active            | DRAFT/PUBLISHED/ARCHIVED plus effective schedule                |
| Admin imageUrl / Storefront imageUrl         | Verified imageMediaId for writes; public image object for reads |
| Storefront subheading / ctaLabel / sortOrder | subtitle / ctaText / position                                   |
| Storefront hero or secondary                 | Backend also supports promo; render intentionally               |
| Preview productIds                           | Canonical product UUIDs in editorial order                      |
| Collection title                             | Explicit stable slug and case-insensitive unique title          |
| Browser preview edits                        | Real authenticated CRUD with revision conflict handling         |

Integration must add collection route/editor schedule controls and use hasVariants to select options. Existing public bootstrap schema remains unchanged; homepage is a separate resource. Source audit is not live frontend acceptance.

## Migration and validation

Additive migration: 20261102070000_phase05d_g5_merchandising. It creates three tables, publication enum, indexes, FK restrictions, uniqueness and ordering/window constraints. Case-insensitive title uniqueness is an intentional SQL expression index. Old applied migrations remain unchanged.

See G5_VALIDATION_STATUS.md for executed static/migration evidence and deferred runtime checks. Next implementation is G6 notifications; G2 email delivery still depends on G7.
