'use strict'
/* global module */
/** Structural release contract assertions: never mark security proven from Swagger alone. */
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const filename = path.join(root, 'artifacts', 'g12', 'openapi.json')
const required = [
  ['get', '/v1/health'],
  ['get', '/v1/auth/me'],
  ['get', '/v1/admin/jobs/status'],
  ['get', '/v1/admin/reports/financial'],
  ['get', '/v1/admin/email/status'],
  ['get', '/v1/admin/push/status'],
  ['get', '/v1/notifications'],
  ['get', '/v1/admin/dashboard/overview'],
]
function checkDocument(doc) {
  const failures = []
  if (!doc || typeof doc !== 'object' || !/^3\./.test(doc.openapi || ''))
    failures.push('OpenAPI 3.x document required')
  if (!doc?.components?.securitySchemes?.['access-token'])
    failures.push('Missing bearer security scheme')
  if (!doc?.components?.securitySchemes?.['guest-cart-token'])
    failures.push('Missing separate guest capability scheme')
  for (const [verb, route] of required)
    if (!doc?.paths?.[route]?.[verb])
      failures.push(`Missing ${verb.toUpperCase()} ${route}`)
  const paths = doc?.paths || {}
  let operationCount = 0
  const operationIds = new Set()
  for (const [route, item] of Object.entries(paths)) {
    if (!route.startsWith('/v1/')) failures.push(`Non-versioned path ${route}`)
    for (const method of ['get', 'put', 'post', 'delete', 'patch']) {
      const op = item?.[method]
      if (!op) continue
      operationCount++
      if (!op.operationId || operationIds.has(op.operationId))
        failures.push(`Missing or duplicate operationId: ${method} ${route}`)
      operationIds.add(op.operationId)
    }
  }
  if (operationCount < 50) failures.push('Suspiciously small API contract')
  if (failures.length) throw new Error(failures.join('; '))
  return { paths: Object.keys(paths).length, operations: operationCount }
}
if (require.main === module) {
  try {
    const doc = JSON.parse(fs.readFileSync(filename, 'utf8'))
    const result = checkDocument(doc)
    process.stdout.write(
      JSON.stringify({ status: 'STRUCTURAL_CONTRACT_OK', ...result }) + '\n',
    )
  } catch (error) {
    process.stderr.write(`G12 contract gate blocked: ${error.message}\n`)
    process.exitCode = 1
  }
}
module.exports = { checkDocument, required }
