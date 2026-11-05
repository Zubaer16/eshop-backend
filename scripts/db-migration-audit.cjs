'use strict'
/** Read-only migration identity and SHA-256 audit. No SQL/schema mutations. */
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { Client } = require('pg')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
function flag(name) {
  const pos = args.indexOf(name)
  return pos >= 0 ? args[pos + 1] : undefined
}
const expectedDb = flag('--expect-db')
const connectionEnv = flag('--connection-env')
const expectedCount = Number(flag('--expect-minimum') || '39')
if (
  (connectionEnv &&
    !['DIRECT_URL', 'DATABASE_URL', 'API_TEST_DATABASE_URL'].includes(
      connectionEnv,
    )) ||
  !expectedDb ||
  !/^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/.test(expectedDb) ||
  !Number.isInteger(expectedCount) ||
  expectedCount < 39 ||
  expectedCount > 10000
) {
  process.stderr.write(
    'Usage: node -r dotenv/config scripts/db-migration-audit.cjs --expect-db <database> [--expect-minimum 39] [--connection-env DIRECT_URL|DATABASE_URL|API_TEST_DATABASE_URL]\n',
  )
  process.exit(2)
}
const url = connectionEnv
  ? process.env[connectionEnv]
  : process.env.DIRECT_URL || process.env.DATABASE_URL
if (connectionEnv === 'API_TEST_DATABASE_URL') {
  let parsed
  try {
    parsed = new URL(url || 'http://invalid.example')
  } catch {
    process.stderr.write('Invalid isolated test connection URL.\n')
    process.exit(2)
  }
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(
      parsed.hostname.toLowerCase(),
    ) ||
    decodeURIComponent(parsed.pathname.slice(1)) !== 'kookaburra_api_test' ||
    expectedDb !== 'kookaburra_api_test'
  ) {
    process.stderr.write(
      'API test audit requires isolated localhost kookaburra_api_test only.\n',
    )
    process.exit(2)
  }
}
if (!url) {
  process.stderr.write(
    'DB connection missing; set DIRECT_URL or DATABASE_URL securely.\n',
  )
  process.exit(2)
}
function sha(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}
async function main() {
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 6000,
  })
  try {
    await client.connect()
    await client.query('BEGIN READ ONLY')
    const { rows: identity } = await client.query(
      'SELECT current_database() AS db, current_user AS db_user, inet_server_port() AS port',
    )
    if (identity[0]?.db !== expectedDb)
      throw new Error('DATABASE IDENTITY MISMATCH: refusing to certify')
    const { rows } = await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at, migration_name',
    )
    const active = rows.filter((row) => row.finished_at && !row.rolled_back_at)
    const pendingFailures = rows.filter(
      (row) => !row.finished_at && !row.rolled_back_at,
    )
    if (pendingFailures.length)
      throw new Error(
        `Unresolved migration attempts: ${pendingFailures.length}`,
      )
    if (active.length < expectedCount)
      throw new Error(
        `Applied ${active.length} migrations, expected >=${expectedCount}`,
      )
    const existing = new Set()
    for (const row of active) {
      const file = path.join(
        root,
        'prisma',
        'migrations',
        row.migration_name,
        'migration.sql',
      )
      if (!fs.existsSync(file))
        throw new Error(`Missing migration source: ${row.migration_name}`)
      if (row.checksum !== sha(fs.readFileSync(file)))
        throw new Error(`Checksum mismatch: ${row.migration_name}`)
      if (existing.has(row.migration_name))
        throw new Error(`Duplicate applied migration: ${row.migration_name}`)
      existing.add(row.migration_name)
    }
    await client.query('COMMIT')
    const sourceDirs = fs
      .readdirSync(path.join(root, 'prisma', 'migrations'), {
        withFileTypes: true,
      })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(
            path.join(
              root,
              'prisma',
              'migrations',
              entry.name,
              'migration.sql',
            ),
          ),
      )
    const notApplied = sourceDirs
      .map((entry) => entry.name)
      .filter((name) => !existing.has(name))
      .sort()
    process.stdout.write(
      JSON.stringify(
        {
          status: 'READ_ONLY_AUDIT_COMPLETE',
          database: identity[0].db,
          applied: active.length,
          matchingChecksums: active.length,
          unresolvedFailures: pendingFailures.length,
          unappliedSourceMigrations: notApplied,
          expectedMinimum: expectedCount,
        },
        null,
        2,
      ) + '\n',
    )
    if (notApplied.length) process.exitCode = 3 // pending migration is NOT applied/accepted
  } finally {
    await client.end().catch(() => undefined)
  }
}
main().catch((error) => {
  // No connection URL, stack trace or provider errors in operational output.
  process.stderr.write(
    'Migration identity/checksum audit blocked: ' +
      (/mismatch|Missing migration|Unresolved migration|Applied |Duplicate applied|DATABASE IDENTITY/.test(
        error.message,
      )
        ? error.message
        : 'database connection, privileges or migration state') +
      '\n',
  )
  process.exitCode = 1
})
