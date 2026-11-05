'use strict'
/** Operator controlled bounded retention. Preview-by-default, single 1000-row batch. */
const { Client } = require('pg')
const apply = process.argv.includes('--apply')
const expectDb = process.argv
  .find((v) => v.startsWith('--expect-db='))
  ?.slice(12)
if (!expectDb || !/^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/.test(expectDb)) {
  process.stderr.write(
    'Usage: node -r dotenv/config scripts/g11-prune-auth-buckets.cjs --expect-db=<database> [--apply]\n',
  )
  process.exit(2)
}
async function run() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url) throw new Error('missing connection')
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 6000,
  })
  try {
    await client.connect()
    const { rows } = await client.query('SELECT current_database() AS db')
    if (rows[0]?.db !== expectDb) throw new Error('identity mismatch')
    if (!apply) {
      const result = await client.query(
        "SELECT count(*)::integer AS pending FROM auth_abuse_buckets WHERE expires_at < statement_timestamp() - interval '1 day'",
      )
      process.stdout.write(
        `PREVIEW: ${result.rows[0]?.pending} expired credential buckets eligible, no mutation.\n`,
      )
      return
    }
    await client.query('BEGIN')
    const result = await client.query(`WITH sample AS (
      SELECT key_hash FROM auth_abuse_buckets
      WHERE expires_at < statement_timestamp() - interval '1 day'
      ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
    ) DELETE FROM auth_abuse_buckets AS b USING sample
      WHERE b.key_hash = sample.key_hash RETURNING b.key_hash`)
    await client.query('COMMIT')
    process.stdout.write(
      `APPLIED: pruned ${result.rowCount} expired HMAC-only buckets (max 1000).\n`,
    )
  } finally {
    await client.end().catch(() => undefined)
  }
}
run().catch(() => {
  process.stderr.write(
    'Retention action blocked (DB identity/config/privileges).\n',
  )
  process.exitCode = 1
})
