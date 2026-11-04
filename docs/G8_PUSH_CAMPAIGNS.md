# G8 FCM, devices and rich campaigns

Status (2026-11-02): IMPLEMENTED / FULL VALIDATION PENDING. Automated tests remain deferred to G12 by owner instruction. No push worker, campaign fanout worker, OAuth exchange or FCM submission was executed. Actual Firebase credentials are not configured; push delivery defaults to disabled. Existing G5–G7 uncommitted work is preserved.

## Owned web registration and privacy

Authenticated GET /v1/notifications/push/config exposes readiness booleans, mode and WEB support, never service-account secrets. GET /devices lists own bounded metadata. POST /devices registers/refreshes an installation UUID, STOREFRONT or ADMIN surface, write-only token, explicit GRANTED acknowledgement and expectedRevision (0 creates). Optional identifierKind chooses REGISTRATION_TOKEN compatibility or the current explicit FID target; FID must have 22 URL-safe characters. The encrypted envelope carries identifier kind/value, so no identifier-type migration or guessing is needed. ADMIN surface requires a current staff role.

Raw identifiers are hashed for uniqueness and AES-GCM encrypted with a separate PUSH_TOKEN_ENCRYPTION_KEY, authenticated against user/device/project identity. They never appear in API metadata, reports, audit or normal logs. An identifier already bound to another installation/account cannot be adopted, even after revoke. Web clients must revoke their registration on sign-out and rotate the Firebase identifier on account switches. Automatic cross-account transfer is intentionally blocked. Registration is refreshed at app startup/token changes; same-token heartbeats preserve revision, actual identity/project/session/expiry changes advance revision. Ten active devices per user/surface are allowed, including reactivation checks.

DELETE /devices/:id?expectedRevision=N revokes only an owned installation, increments revision and clears ciphertext. Registrations expire after 30 days without refresh. Submission rechecks device revision, project, current user status and sessionVersion, so password changes/reset fence old devices; normal logout also requires client revoke. Stale records are excluded rather than silently reused. Invalid FCM registration responses clear ciphertext and mark INVALID; a late response cannot invalidate a newer rotated revision. Long-term historical-row pruning/key-rotation recovery belongs to G10 operations.

Private order/payment/security/operational pushes use generic copy and an opaque delivery ID plus target type. No order UUID, payment detail, action token or raw source payload is included in FCM data. GET /deliveries/:id/target requires the current authenticated owner and rechecks order ownership or staff permission before returning the typed canonical destination. The default private click link leads to the protected account/Admin entry. UI/service-worker integration must resolve the opaque delivery ID after authentication; it must not trust a notification tap as authorization.

## Independent transactional push and provider

PushQueue uses shared G6/G7 authoritative event resolution: order/customer identity is read from PostgreSQL, payment success requires committed verified settlement, refunds and shipments require their actual records, and stock alerts check current physical stock. Security action-token issuance events are excluded. Required email stays independent; transactionalPush and operationalPush control optional push, while an actual device registration also requires explicit client permission. Staff routing uses current grants, the correct ADMIN surface and current operational preferences. G6 in-app history remains independent of FCM failure or browser permission denial; deployment must run the appropriate subscribers.

PushEventReceipt does not mutate global OutboxEvent status/attempts. Unique event/device jobs, source row locks and transactional queueing prevent duplicate fanout. PushDispatcher persists a five-minute lease and STARTED attempt before releasing the database transaction for network I/O. Sender validation rechecks consent/permission/authority, installation revision/expiry/epoch and current campaign state. Jobs older than 24 hours are skipped. A deterministic browser notification tag uses the delivery UUID.

PushProvider abstracts transport. FcmPushProvider uses HTTP v1 with fixed Google OAuth/FCM endpoints, scoped RS256 service-account assertions, short-lived in-memory OAuth caching, HTTPS links/images, bounded payload/network timeouts and no provider logging. It supports explicit FID targeting alongside registration-token compatibility. No new npm dependency was added. Service-account configuration must match the deployment's own Firebase project; credentials and encryption stay backend-only. Public Firebase client/VAPID configuration belongs in each frontend deployment, not this secret API.

| Delivery state       | Meaning                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| PENDING / PROCESSING | Queued or persistently leased                                                      |
| ACCEPTED             | FCM returned a project message identifier; device display/click is unverified      |
| FAILED               | Safe retryable rejection/preparation failure                                       |
| REJECTED             | Permanent error or five attempts exhausted                                         |
| SKIPPED              | Device, authority, target, consent, allowlist or job age no longer permits sending |
| REQUIRES_REVIEW      | Submission outcome uncertain or worker lease abandoned; no automatic resend        |

Backoff begins at 60 seconds, caps its exponential component at one hour and respects a larger provider Retry-After. Explicit UNREGISTERED/SENDER_ID_MISMATCH invalidates the old registration; arbitrary INVALID_ARGUMENT does not. Timeouts after submission remain uncertain. Event queue planning has separate bounded retries/failure visibility. G10/G11 own scheduler operation, recovery controls, retention and real-provider verification. FCM acceptance never proves exactly-once receipt, browser display, rich-image fetch or user click.

## Campaign contracts and consent

OWNER or current marketing.manage may list/create/read/edit draft campaigns, preview, cancel and inspect aggregate metrics under /v1/admin/push/campaigns. OWNER alone approves via POST /:id/approve with expectedRevision and optional timezone-qualified scheduledAt. Draft edits, approval and cancellation are revision checked/audited. Approval freezes content and selected audience; there is no arbitrary send/recipient override endpoint. Preview performs no provider call.

Audience is ALL_OPTED_IN_CUSTOMERS or an explicit set of 1–200 canonical active customer UUIDs. Campaigns cannot force consent. Fanout walks eligible customers in UUID order using a durable cursor and per-campaign/user receipt. Each page atomically creates opted-in in-app recipients and/or jobs for current marketingPush devices. Marketing consent and flags are rechecked immediately before sending; optional email consent does not enable push. Opted-in in-app history survives failed FCM. Customers with push permission denied can still receive opted-in in-app content.

States are DRAFT, SCHEDULED, FANOUT, FANOUT_COMPLETE, CANCELLED and REQUIRES_REVIEW. Database time controls due selection. Each run handles at most ten due campaigns, with 1–200 customers per campaign page. A full page may need a following empty page to mark completion. Five one-minute fanout failures pause the campaign for review. Audience eligibility is evaluated when its cursor position is reached and again before submission; this is a finite traversal, not an approval-time exhaustive recipient snapshot. Later opt-ins behind the cursor are not retroactively added. A campaign is not repeatedly resent to the same audience.

Cancellation stops new fanout and pending submissions, detaches its editable media ref and preserves already-created history. It cannot recall an already accepted push or erase a client's cached image. FANOUT_COMPLETE means queue traversal finished, not that every device received a message. Metrics distinguish recipients processed, in-app created, push queued, accepted, failed/review, skipped and pending; deviceDeliveryVerified remains false.

## Rich media and typed targets

Campaign targets are HOME, active PRODUCT, active CATEGORY, currently published nonempty COLLECTION or effective G4 promotion OFFER. Private ORDER/TRACKING targets are allowed only in authoritative customer/operational event paths, not broad campaigns. Targets are checked at save/approval/preview/fanout/submission and authenticated click resolution. No arbitrary URL or fixture identity is accepted. Collection pages and offer presentation still need frontend adapters. Push campaign content is distinct from G4 financial promotions/coupons; checkout remains pricing authority.

Images use verified Media Library UUIDs within the configured namespace, bounded raster metadata and row-locked pending-delete rescue; PROCESSING deletion is rejected. Draft/campaign/delivery/inbox references all protect media lifecycle, orphan reconciliation and workers. Draft assets are not public through disk serving. Once approved fanout publishes a marketing notification snapshot, its raster image may be served publicly to support FCM/browser fetch, just like other public merchandising assets. Published/history refs retain images until deliberate retention cleanup. HTTPS is required by the real provider; local disk tests use a fake transport and do not certify deployed rich-image display.

NotificationItemDto gains a nullable image allowlist. Marketing items are visible only to their own current customer with marketingInApp consent; withdrawing it hides those items. Existing private items return image=null. Source OpenAPI expectations were updated for the additive field without weakening token/RBAC checks.

## Admin APIs, tools and integration boundary

OWNER-only /v1/admin/push/status, /deliveries and /planning-failures expose safe configuration presence and bounded status history, without ciphertext, raw identifier, user ID or provider credentials. Campaign metrics remain available to marketing operators. providerVerified=false records that no provider check was performed.

The operator tools default to preview:

    npm run push:queue -- --since 2026-11-02T10:00:00Z --limit 50
    npm run push:dispatch -- --since 2026-11-02T10:00:00Z --limit 50
    npm run push:campaigns -- --limit 50

--apply activates the corresponding mutation/submission when configured. None ran during G8. Queue/sender must use a fixed activation boundary across scheduled runs so retries are not excluded. The campaign tool intentionally has no ignored --since argument: it processes explicitly approved due campaigns. PUSH_DELIVERY_MODE defaults disabled; controlled requires an explicit canonical user allowlist; production mode requires production environment. .env.example names the project/service-account/encryption/origin settings. Actual secrets were not changed or printed.

Both frontends still require Firebase client setup, service worker, foreground/background/tap handling, permission UI, registration/refresh/revoke wiring, authenticated typed navigation and composer/preview/OWNER approval/schedule/metrics screens. No live Next.js integration was performed. Flutter/device-platform support remains after full web E2E, per the architecture decision. Source audit v1.14.0 = 6 MATCH / 15 ADAPTER across 21 findings; zero PLANNED in that narrow inventory is not overall roadmap completion.

Official references inspected: [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [current message/FID schema](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages), [error handling](https://firebase.google.com/docs/cloud-messaging/error-codes), [registration lifecycle](https://firebase.google.com/docs/cloud-messaging/manage-tokens), [service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account). These support protocol choices, not live-provider acceptance.

## Migration and next work

20261102100000_phase05g_g8_push_campaigns adds seven tables, rich inbox associations, FK/unique/index/state bounds and an additive expansion of the original notification CHECK. Historical applied migration SQL was not edited. Verified backups preceded deployment to separate local dev/test DBs; both now have 37 active matching migrations and no unresolved failures. See G8_VALIDATION_STATUS.md and external validation/2026-11-02-g8/.

Next implementation: G9 reporting/activity. G5–G8 runtime validation remains pending at G12; G2 actual SMTP email acceptance and G11 provider/deployment/restore proof remain open.
