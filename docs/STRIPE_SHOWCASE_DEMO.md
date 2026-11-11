# Stripe TEST-only hosted showcase — 2026-11-11

## Purpose, guarantees and deployment scope

This change enables a **deliberately opted-in Stripe TEST-only showcase** while preserving `NODE_ENV=production` on a publicly deployed API. No Stripe live checkout, real-money payment, arbitrary customer card submission, browser client secrets, or force-PAID endpoint is implemented. Pre-existing auth/ownership, reservation windows, server-side exact money accounting, Stripe `sk_test_` key validation, `livemode:false` provider verification, raw-body webhook HMAC, receipt dedupe, and independent settlement/refund workers remain in force.

`STRIPE_DEMO_MODE` is **false by default**, strictly `true`/`false`, and must be accompanied by `STRIPE_TEST_ENABLED=true`. It permits individual `STRIPE_TEST_CHECKOUT_ENABLED=true` and `STRIPE_TEST_REFUNDS_ENABLED=true` flags to run in production **only** for sandbox operations. With `STRIPE_DEMO_MODE=false`, production continues to reject TEST checkout/refunds at config validation and runtime. An `sk_live_...` key is rejected regardless of this flag. Switching to `NODE_ENV=development` on public Vercel is not a substitute.

This changes only server gates/documentation and adds unit tests. It does **not** change Prisma schema/SQL migrations, REST routes, transaction/stock/refund state transitions, secrets, frontend bundles, cron schedule, deployment plan, or release acceptance. Source/test result for this delivery must be recorded separately from the historical 2026-11-08 release acceptance and 2026-11-09 media validation.

## Required Vercel Backend configuration

Set these in the **eshop-backend** Vercel project for the intended environment; substitute your own private test credentials (do **not** put the secrets in Git, screenshots or Frontend NEXT_PUBLIC fields):

```dotenv
NODE_ENV=production
STRIPE_DEMO_MODE=true
STRIPE_TEST_ENABLED=true
STRIPE_TEST_CHECKOUT_ENABLED=true
STRIPE_TEST_REFUNDS_ENABLED=true
STRIPE_TEST_SECRET_KEY=sk_test_<YOUR_PRIVATE_TEST_KEY>
STRIPE_TEST_WEBHOOK_SECRET=whsec_<YOUR_PRIVATE_WEBHOOK_SIGNING_SECRET>
```

Also supply the project's already-required `DATABASE_URL`, `JWT_ACCESS_SECRET`, `CORS_ORIGINS` (HTTPS origins for **both** deployed frontends), and any other enabled-service credentials. The Backend validator rejects incomplete production settings. Set frontend `NEXT_PUBLIC_ESHOP_MODE=live`, `NEXT_PUBLIC_ESHOP_API_URL=https://eshop-backend-mu.vercel.app` (bare origin; frontend adds `/v1`) and `ESHOP_APP_ORIGIN` to each frontend's **own** exact HTTPS origin; frontend apps must be redeployed after changing public variables. Never duplicate Stripe keys on the frontends.

Create the Stripe **Sandbox/Test mode** snapshot destination for **`payment_intent.succeeded`**, with the exact Backend URL below; configure its destination-specific `whsec_...` signing secret in the Backend:

`https://eshop-backend-mu.vercel.app/v1/payments/stripe/webhook`

The URL assumes the currently supplied `eshop-backend-mu.vercel.app` domain. If it changes, update the Stripe endpoint accordingly. The webhook responds with receipt acceptance and does **not** synchronously mark an order PAID.

## Required reconciliation and refund execution

1. The customer signs in, completes normal cart / address / reserve / unpaid-order steps, **Prepare TEST payment**, then **Simulate TEST payment**. The Backend confirms/captures only Stripe's fixed TEST card; it never collects raw card details.
2. Stripe sends signed `payment_intent.succeeded` to `/v1/payments/stripe/webhook`. The Backend durably stores a receipt, after verifying the raw event signature, timestamp, and TEST mode.
3. An authorized durable job `payments.reconcile` runs separately, re-reads Stripe TEST and the receipt, then can commit payment/order **PAID** if all existing invariants pass. Without this worker, webhook delivery by itself leaves the order awaiting reconciliation.
4. A separately approved refund request requires `refunds.execute`; a refund succeeds in the UI only after verified provider reconciliation. No stock is returned merely due to financial refund.
5. Expired orders/unneeded intents additionally use existing `checkout.orders`, `checkout.reservations`, and `payments.cancel` worker lanes when applicable.

This overlay **does not activate Vercel Cron**. An existing, operator-controlled option is `GET /v1/internal/jobs/tick` with `Authorization: Bearer <JOBS_CRON_SECRET>` and `JOBS_CRON_ENABLED=true`, `JOBS_ALLOWED_LANES=payments.reconcile,refunds.execute,payments.cancel,checkout.orders,checkout.reservations`. The secret must have 48-512 non-whitespace characters. For Vercel's automatic cron bearer authorization, its configured `CRON_SECRET` must match `JOBS_CRON_SECRET`; the `vercel.json` schedule and plan allowances still need explicit review. The endpoint is disabled by default, processes at most three due lanes per invocation, and is not a public/manual payment shortcut. Do not expose the cron secret or use a browser URL to try it. Check Vercel plan scheduling and execution-time limits before enabling.

Alternative operator-controlled worker commands from a trusted execution environment connected to the **intended** DB (never run against an unknown or protected DB):

```powershell
node dist/tools/jobs-worker.js --lane payments.reconcile
node dist/tools/jobs-worker.js --lane refunds.execute
# Only after explicit DB/provider permission, apply individually:
node dist/tools/jobs-worker.js --lane payments.reconcile --apply
node dist/tools/jobs-worker.js --lane refunds.execute --apply
```

The `--apply` commands write state and may call Stripe TEST; they require `JOBS_ALLOWED_LANES` and appropriate flags. Use an isolated test database first. Never run application DB migrations or reset commands blindly against a deployed database.

## Local validation and acceptance boundary

1. Use Node `>=24.11.0 <25` (`.nvmrc` / package engine). `npm ci`, `npm run check:static`, and focused Jest tests confirm new gates.
2. If a fully isolated test DB is available, run the existing guarded release/testing pipeline from project instructions. Confirm no SQL migration is added and all existing business-state tests remain passing.
3. Redeploy the updated Backend **code** (extracting locally does not update Vercel), configure secret ENV, then check `/v1/health` and the real signed Stripe webhook in Sandbox. Use test customer/order fixtures and inspect receipt, `payments.reconcile` run, `PAID` order and refund history independently. Strip secrets from logs/screenshots.
4. External Stripe TEST settlement/refund, deployed worker/cron, HTTPS and database restore validation require their own evidence; unit/build PASS alone does not establish hosted success.

Rollback: revert this overlay (prefer version-controlled revert) or set `STRIPE_DEMO_MODE=false`, `STRIPE_TEST_CHECKOUT_ENABLED=false`, `STRIPE_TEST_REFUNDS_ENABLED=false` and redeploy. **Do not** remove signing-secret validation, test-key restrictions or live-route guards to bypass a failed check.
