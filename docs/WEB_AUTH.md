# Web authentication

Current combined validation is tracked in [Web validation](WEB_VALIDATION.md). Implementation-time test deferrals and earlier acceptance counts below are historical for their snapshots.


User and Admin keep login across reload, new tabs and browser restart. The owner replaced the initial memory-only policy on 2026-11-07. Refresh sessions use a persistent HttpOnly cookie on each frontend's own origin. Access tokens stay in memory and domain requests still use direct Bearer JWT against `/v1`. The existing NestJS/mobile/API token contract is unchanged.

Live mode is the default. Set `NEXT_PUBLIC_ESHOP_MODE=preview` explicitly for the separate sample UI. API failures never enable preview; unconnected business screens show an unavailable state.

## Configuration

- Set `NEXT_PUBLIC_ESHOP_API_URL` to a bare trusted Backend origin, e.g. `http://localhost:4000` locally, HTTPS in production. No `/v1` suffix, credentials, query or fragment. The legacy public variable remains a fallback. Optional server-only `ESHOP_API_URL` points the session bridge to the same trusted Backend, e.g. through private routing.
- Set `ESHOP_APP_ORIGIN` to the exact public frontend origin: User `http://localhost:3000`, Admin `http://localhost:3001` for the normal local setup. Non-default ports/hostnames require their actual origins. Production requires an explicit HTTPS origin. No trust in arbitrary forwarded host headers.
- Restart Next after environment changes. Configure Backend `CORS_ORIGINS` for the frontend origins used by direct Bearer domain requests. Frontends now require a Node/Next runtime for the session endpoint; static-only export cannot provide it. No database, JWT signing, SMTP or payment secrets enter frontend environment files.

## Cookie and restoration lifecycle

Each app has one narrowly scoped `POST /api/auth/session` Route Handler for `login`, customer-only `register`, `refresh` and `logout`. It calls only fixed Backend auth paths. The refresh credential is set in an opaque host-only, HttpOnly, SameSite=Lax cookie; production adds Secure and the `__Host-` prefix. User/Admin use different cookie names. No refresh token is returned in JSON, React state, browser storage or HTML. Only allowlisted identity/access fields leave the handler.

Cookies have a 30-day maximum age, matching the Backend's existing rotating refresh lifetime. Successful refresh renews that window. Session expiry, account disable, credential/session revocation, browser-data clearing or explicit logout can require sign-in again. Private/incognito browser behavior still controls its own storage lifetime.

At application startup, auth guards wait for a single shared restoration request. The HttpOnly cookie obtains a new short-lived access token, then `/auth/me` or `/admin/auth/me` verifies the current account/grants. Anonymous/expired sessions clear the cookie; transient service errors do not silently destroy it. No cookie presence or unverified client role grants access on its own.

## Security and concurrency

- Session writes require the exact configured Origin, JSON and a custom same-origin header; cross-site Fetch Metadata is rejected. GET cannot mutate the session. Input is bounded to 4096 bytes and known fields/actions. No arbitrary proxy URLs, browser cookie forwarding or redirect following.
- Tokens are never written to localStorage, sessionStorage or Zustand. Business API cookies remain omitted; only the same-origin session endpoint receives its own cookies. Cookie values and auth request bodies must not be logged.
- Browser Web Locks serialize cookie rotation across tabs; each document also queues exchanges. The server coalesces only simultaneous refreshes in the same process, without caching successful rotated credentials. Backend replay detection remains intact. Modern HTTPS/localhost browsers with Web Locks are the supported multi-tab path; older contexts retain document serialization and fail closed on invalid/replayed sessions.
- Cross-tab login/logout messages contain no credentials. Logout clears private state immediately in all same-app tabs; account switching discards the previous identity and restores the current shared session. User/Admin channels and cookies remain separate. Late responses from an externally changed tab cannot overwrite identity or revoke a newer tab's cookie.
- Logout clears the cookie even if upstream revocation fails and reports unconfirmed server revocation honestly. Network failure before the frontend response arrives cannot guarantee cookie deletion. Logout never claims that every previously issued access JWT was synchronously invalidated; Backend expiration/version rules still apply.
- Current identity refreshes on focus, visibility and every visible 60-second interval. Backend authorization remains authoritative; current grants filter navigation/deep links and remount private content.

The Backend's existing anonymous IP abuse limits remain enabled according to its deployment configuration. A server auth hop changes the IP seen upstream: it must be included in the reviewed trusted-proxy/rate-limit deployment design. This bridge intentionally does not forward user-supplied X-Forwarded-For headers or weaken those limits. Local fixture acceptance does not certify the production proxy chain.

## Request and account behavior

The domain transport retains no-store JSON, safe query encoding, cancellation, redirect refusal and a 15-second timeout. Concurrent access renewal is single-flight. GET may replay once after 401 renewal; POST/PUT/PATCH/DELETE never automatically replay, including after timeouts. Review mutation results and use the owning API's idempotency/reconciliation rules. Wrong-current-password 401 does not renew an otherwise valid session. Rate limits expose bounded Retry-After delays.

User signup/login/account identity, password change, verification request/confirmation and recovery/reset are live. Admin login is for existing staff only. Profile/addresses, business CRUD/reports and commerce remain in their owning integration steps. Preview stores are not hydrated in live mode.

One-time verification/reset challenges use URL fragments, are immediately removed from history and remain only in component memory. There is no query-token ingestion, debug display or automatic confirmation. Same-route new links reset the form; replay fails. Recovery responses remain non-enumerating. Password change/reset revokes existing sessions; password change signs out after confirmation. SMTP delivery acceptance remains separate.

## Validation

Each frontend: `npm run test:auth` covers the auth/session/bridge foundation (the earlier 24-case PASS is historical; the new public-read cancellation case is deferred); `npm run check` verifies structure, TypeScript, lint and production build. The original explicit-preview suites remain separate.

Backend `npm run test:web:auth` builds, typechecks and runs real cross-app browser flows through the guarded runner. It permits only fixed separate localhost `kookaburra_api_test`. Servers use Backend 4101, User 3300, Admin 3301 with exact app origins and pinned server/public API origins. Frontend child environments omit Backend secrets. Fixtures own their generated users/events and restore changed role grants; external providers stay disabled; the guarded web runner now supports a disposable disk provider for catalog flows. Test-only one-time challenges come from controlled encrypted outbox fixtures.

Coverage includes persistent User/Admin reload, concurrent tabs, new browser contexts, logout/Back/reload, audience and cookie isolation, CSRF, backend expiry, cross-tab identity changes, grant/account revocation and verification/reset/password-change. Browser tests reject unhandled page errors. Historical auth evidence stays under `validation/web-integration/auth/`; future combined browser JSON is `validation/web-integration/browser-results.json`; prior memory-only evidence is historical. Auth traces contain sensitive test credentials/cookies and stay local/ignored.

No migration, production provider delivery or complete release acceptance is implied. Existing Backend `release:*` commands are unchanged; the previous full release receipt remains historical after source changes.
