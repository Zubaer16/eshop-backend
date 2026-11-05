'use strict'
/** Read-only remote deployment liveness/auth smoke; never sends email, money or jobs. */
const base = process.argv.find((v) => v.startsWith('--base='))?.slice(7)
let origin
try {
  const parsed = new URL(base)
  if (parsed.origin !== base || parsed.protocol !== 'https:')
    throw new Error('HTTPS origin')
  origin = base
} catch {
  process.stderr.write(
    'Usage: node scripts/g11-smoke.cjs --base=https://api.example.com\n',
  )
  process.exit(2)
}
const timeoutMs = 10000
async function get(path) {
  const response = await fetch(origin + path, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await response.text()
  return { status: response.status, body, headers: response.headers }
}
async function main() {
  const health = await get('/v1/health')
  if (health.status !== 200) throw new Error('health is not 200')
  let object
  try {
    object = JSON.parse(health.body)
  } catch {
    throw new Error('health did not return JSON')
  }
  if (object.status !== 'ok' || !object.service)
    throw new Error('unexpected health response')
  const admin = await get('/v1/admin/jobs/status')
  if (admin.status !== 401 && admin.status !== 403)
    throw new Error('unauthenticated admin access not denied')
  const docs = await get('/docs')
  if (![404, 403].includes(docs.status))
    throw new Error('public Swagger not disabled')
  process.stdout.write(
    JSON.stringify(
      {
        outcome: 'NON_MUTATING_DEPLOYMENT_SMOKE_OK',
        health: health.status,
        adminDenied: admin.status,
        swaggerClosed: docs.status,
        note: 'No database, migration, Stripe, SMTP, FCM, cron, restore or browser assertion performed.',
      },
      null,
      2,
    ) + '\n',
  )
}
main().catch(() => {
  process.stderr.write(
    'Deployment smoke blocked; inspect private deployment logs.\n',
  )
  process.exitCode = 1
})
