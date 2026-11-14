'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const {
  validateLocal,
  validateExternal,
  externalKinds,
  within,
} = require('./release-acceptance-gate.cjs')
const { tasks } = require('./release-run-local.cjs')
const { checkDocument, required } = require('./release-openapi-check.cjs')
test('release acceptance local receipt must match source, Node24 and every real step', () => {
  const source = { sha256: 'e'.repeat(64), files: 3 }
  const record = {
    schema: 1,
    status: 'LOCAL_SUITES_EXIT_ZERO',
    node: '24.11.0',
    source,
    finishedAt: new Date().toISOString(),
    steps: tasks.map((task) => ({
      task,
      exitCode: 0,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    })),
  }
  assert.doesNotThrow(() => validateLocal(record, source))
  const wrong = JSON.parse(JSON.stringify(record))
  wrong.steps[2].exitCode = 1
  assert.throws(() => validateLocal(wrong, source), /failed suite receipt/)
  wrong.steps[2].exitCode = 0
  wrong.source.sha256 = '0'.repeat(64)
  assert.throws(() => validateLocal(wrong, source), /fingerprint/)
  assert.throws(
    () => validateLocal({ ...record, node: '22.16.0' }, source),
    /Node 24/,
  )
})
test('external evidence verifies all categories, file hashes and safe paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-test-'))
  try {
    const now = new Date().toISOString()
    const evidence = externalKinds.map((kind, i) => {
      const file = `evidence-${i}.txt`
      const content = `placeholder-test-${i}`
      fs.writeFileSync(path.join(dir, file), content)
      return {
        kind,
        result: 'PASS',
        reviewedBy: 'local reviewer',
        reviewedAt: now,
        file,
        sha256: createHash('sha256').update(content).digest('hex'),
      }
    })
    assert.doesNotThrow(() => validateExternal({ schema: 1, evidence }, dir))
    assert.throws(
      () => validateExternal({ schema: 1, evidence: evidence.slice(1) }, dir),
      /missing/,
    )
    evidence[0].sha256 = '0'.repeat(64)
    assert.throws(
      () => validateExternal({ schema: 1, evidence }, dir),
      /hash differs/,
    )
    assert.throws(
      () => within(dir, '../outside.txt'),
      /Unsafe|under validation/,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
test('OpenAPI structure asserts checkout paths, bearer authentication and retired cart absence', () => {
  const paths = {}
  for (const [verb, route] of required) {
    paths[route] ||= {}
    paths[route][verb] = { operationId: `${verb}_${route}` }
  }
  for (let i = 0; i < 55; i++)
    paths[`/v1/x${i}`] = { post: { operationId: `op_${i}` } }
  const doc = {
    openapi: '3.0.0',
    paths,
    components: {
      securitySchemes: { 'access-token': {} },
    },
  }
  assert.doesNotThrow(() => checkDocument(doc))
  delete paths['/v1/admin/jobs/status']
  assert.throws(() => checkDocument(doc), /Missing GET/)
})
