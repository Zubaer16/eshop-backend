'use strict'
/* global module */
/** Run G12 deferred suites ONCE, sequentially, with source-bound exit-code receipts.
 * This is a local acceptance candidate, not proof of provider/deployment acceptance. */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { fingerprint } = require('./g12-source-fingerprint.cjs')
const root = path.resolve(__dirname, '..')
const destination = path.join(root, 'validation', 'g12-local', 'receipt.json')
const tasks = [
  'check',
  'test:api:smoke',
  'test:api:db:deploy',
  'test:api:db',
  'test:api:security',
  'test:api:visual:all',
  'alignment:audit',
  'alignment:test',
  'jobs:verify:source',
  'g12:openapi',
  'g12:openapi:check',
  'g12:tooling:test',
]
function save(data) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const temp = destination + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(temp, destination)
}
function main() {
  if (process.argv.length !== 2)
    throw new Error('G12 local runner accepts no bypass options')
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major !== 24 || minor < 11)
    throw new Error('G12 local acceptance requires Node >=24.11')
  if (
    !process.env.API_TEST_DATABASE_URL &&
    !fs.existsSync(path.join(root, '.env.api-test'))
  )
    throw new Error(
      'Configure isolated local .env.api-test before G12 DB suites',
    )
  const source = fingerprint()
  const record = {
    schema: 1,
    status: 'IN_PROGRESS',
    scope: 'LOCAL_G12_SUITES_ONLY',
    source,
    node: process.versions.node,
    startedAt: new Date().toISOString(),
    steps: [],
  }
  save(record)
  for (const task of tasks) {
    process.stdout.write(`\n=== G12 ${task} ===\n`)
    const startedAt = new Date().toISOString()
    const child =
      process.platform === 'win32'
        ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npm run ${task}`], {
            cwd: root,
            env: process.env,
            stdio: 'inherit',
            windowsHide: false,
          })
        : spawnSync('npm', ['run', task], {
            cwd: root,
            env: process.env,
            stdio: 'inherit',
            windowsHide: false,
          })
    const exitCode = child.error ? -1 : child.status
    record.steps.push({
      task,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode,
    })
    if (exitCode !== 0) {
      record.status = 'BLOCKED'
      save(record)
      throw new Error(`G12 suite failed: ${task}; see terminal output`)
    }
    save(record)
  }
  if (fingerprint().sha256 !== source.sha256) {
    record.status = 'BLOCKED'
    save(record)
    throw new Error('Source changed during G12 suite execution')
  }
  record.status = 'LOCAL_SUITES_EXIT_ZERO'
  record.finishedAt = new Date().toISOString()
  save(record)
  process.stdout.write(
    'G12 local suites exited 0. Provider/restore/deploy acceptance is NOT implied.\n',
  )
}
if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
module.exports = { tasks }
