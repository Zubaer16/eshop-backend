'use strict'
/* global module */
/** Read-only release acceptance evidence gate. Never treats uploaded ZIP or self-report as local PASS. */
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { fingerprint } = require('./release-source-fingerprint.cjs')
const { tasks } = require('./release-run-local.cjs')
const root = path.resolve(__dirname, '..')
const localPath = path.join(root, 'validation', 'release-local', 'receipt.json')
const externalPath = path.join(
  root,
  'validation',
  'release-external',
  'evidence.json',
)
const externalKinds = [
  'smtp-verify-reset',
  'fcm-controlled',
  'stripe-test-payment-refund-reconcile',
  'media-provider-lifecycle',
  'scheduler-recovery',
  'database-restore-rehearsal',
  'staging-https-deployment',
  'secret-dependency-audit',
]
function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}
function within(base, relative) {
  if (
    typeof relative !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,200}$/.test(relative)
  )
    throw new Error('Unsafe evidence file path')
  const destination = path.resolve(base, relative)
  if (
    !destination.startsWith(path.resolve(base) + path.sep) ||
    relative.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Evidence file must remain under validation/release-external')
  let cursor = path.resolve(base)
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part)
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink())
      throw new Error('Symbolic links prohibited in evidence paths')
  }
  return destination
}
function validateLocal(record, source) {
  if (record?.schema !== 1 || record.status !== 'LOCAL_SUITES_EXIT_ZERO')
    throw new Error('Missing completed local release acceptance suite receipt')
  if (!record.node?.startsWith('24.'))
    throw new Error('Receipt is not from Node 24')
  if (
    record.source?.sha256 !== source.sha256 ||
    record.source.files !== source.files
  )
    throw new Error('Receipt source fingerprint does not match current code')
  if (!Array.isArray(record.steps) || record.steps.length !== tasks.length)
    throw new Error('Incomplete suite receipt')
  for (let i = 0; i < tasks.length; i++) {
    const step = record.steps[i]
    if (
      step?.task !== tasks[i] ||
      step.exitCode !== 0 ||
      !Number.isFinite(Date.parse(step.startedAt)) ||
      !Number.isFinite(Date.parse(step.finishedAt))
    )
      throw new Error(`Incomplete/failed suite receipt: ${tasks[i]}`)
  }
  if (!Number.isFinite(Date.parse(record.finishedAt)))
    throw new Error('Local suite completion time missing')
}
function validateExternal(record, base) {
  if (record?.schema !== 1 || !Array.isArray(record.evidence))
    throw new Error('Missing external evidence manifest')
  const seen = new Set()
  for (const entry of record.evidence) {
    if (!externalKinds.includes(entry?.kind) || seen.has(entry.kind))
      throw new Error('Unknown or duplicated external evidence kind')
    seen.add(entry.kind)
    if (
      entry.result !== 'PASS' ||
      typeof entry.reviewedBy !== 'string' ||
      entry.reviewedBy.trim().length < 2 ||
      !Number.isFinite(Date.parse(entry.reviewedAt)) ||
      typeof entry.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    )
      throw new Error(`Incomplete external evidence: ${entry.kind}`)
    const file = within(base, entry.file)
    if (
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile() ||
      fs.lstatSync(file).isSymbolicLink() ||
      sha256(fs.readFileSync(file)) !== entry.sha256
    )
      throw new Error(`Evidence file missing or hash differs: ${entry.kind}`)
  }
  for (const required of externalKinds)
    if (!seen.has(required))
      throw new Error(`External gate missing: ${required}`)
}
function main() {
  const failures = []
  const source = fingerprint()
  let local
  try {
    local = JSON.parse(fs.readFileSync(localPath, 'utf8'))
    validateLocal(local, source)
  } catch (error) {
    failures.push(`LOCAL: ${error.message}`)
  }
  try {
    const external = JSON.parse(fs.readFileSync(externalPath, 'utf8'))
    validateExternal(external, path.dirname(externalPath))
  } catch (error) {
    failures.push(`EXTERNAL: ${error.message}`)
  }
  process.stdout.write(
    JSON.stringify(
      {
        status: failures.length
          ? 'RC_BLOCKED'
          : 'EVIDENCE_COMPLETE_OWNER_REVIEW_REQUIRED',
        localSource: source.sha256,
        checkedLocalSuites: tasks.length,
        checkedExternalCategories: externalKinds.length,
        failures,
        note: 'Gate verifies local exit codes and file hashes, not authenticity of provider claims. Owner must review evidence and separately accept RC.',
      },
      null,
      2,
    ) + '\n',
  )
  if (failures.length) process.exitCode = 1
}
if (require.main === module) main()
module.exports = { validateLocal, validateExternal, externalKinds, within }
