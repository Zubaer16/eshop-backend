/* Read-only schema/source audit. Does not run application/test code or access a database. */
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { isDeepStrictEqual } = require('node:util')
async function main() {
  const root = path.resolve(__dirname, '..')
  const spec = JSON.parse(
    fs.readFileSync(path.join(root, 'artifacts/release/openapi.json'), 'utf8'),
  )
  const admin = path.resolve(root, '../eshop-admin-frontend')
  const { formContracts } = await import(
    pathToFileURL(path.join(admin, 'lib/api/management-contract.ts')).href
  )
  for (const [name, fields] of Object.entries(formContracts)) {
    const schema = spec.components.schemas[name]
    if (!schema) throw new Error('Missing canonical request schema: ' + name)
    const expected = Object.entries(schema.properties).map(
      ([key, property]) => ({
        key,
        type: property.type || 'string',
        required: schema.required?.includes(key) || false,
        ...Object.fromEntries(
          Object.entries(property).filter(([k]) =>
            [
              'enum',
              'minimum',
              'maximum',
              'minLength',
              'maxLength',
              'nullable',
              'format',
              'items',
            ].includes(k),
          ),
        ),
      }),
    )
    if (!isDeepStrictEqual(fields, expected))
      throw new Error('Form allowlist drift: ' + name)
  }
  for (const repo of [admin, path.resolve(root, '../eshop-user-frontend')]) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repo, 'package.json'), 'utf8'),
    )
    if (pkg.dependencies.firebase !== '13.2.0')
      throw new Error('Unreviewed browser messaging dependency')
  }
  process.stdout.write(
    JSON.stringify({
      status: 'SOURCE_AUDIT_COMPLETE',
      requestSchemas: Object.keys(formContracts).length,
      providerInvoked: false,
      testsExecuted: false,
    }) + '\n',
  )
}
main().catch((error) => {
  process.stderr.write(error.message + '\n')
  process.exitCode = 1
})
