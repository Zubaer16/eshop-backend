'use strict'
/* global module */
/** Stable, secret-free fingerprint of the source a G12 suite actually exercises. */
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const inputs = [
  'src',
  'prisma',
  'api-tests',
  'swagger-ui-tests',
  'test',
  'scripts',
  'contracts',
  'package.json',
  'package-lock.json',
  'prisma.config.ts',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsconfig.spec.json',
  'jest.config.cjs',
  'jest.e2e.config.cjs',
  '.github',
  'playwright.api.config.mjs',
  'playwright.swagger.config.mjs',
  'eslint.config.mjs',
  'deploy/Dockerfile',
]
function fingerprint(base = root) {
  const entries = []
  function collect(rel) {
    // Prisma generate writes generated runtime code inside src/; it is not authored source.
    if (
      rel === 'src/generated/prisma' ||
      rel.startsWith('src/generated/prisma/')
    )
      return
    const full = path.join(base, rel)
    const stat = fs.lstatSync(full)
    if (stat.isSymbolicLink())
      throw new Error(`Symbolic link prohibited: ${rel}`)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) collect(`${rel}/${name}`)
    } else if (stat.isFile()) {
      const bytes = fs.readFileSync(full)
      const digest = createHash('sha256').update(bytes).digest('hex')
      entries.push([rel.replaceAll('\\', '/'), digest])
    }
  }
  for (const rel of inputs) collect(rel)
  entries.sort(([a], [b]) => a.localeCompare(b, 'en'))
  return {
    files: entries.length,
    sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
  }
}
if (require.main === module)
  process.stdout.write(JSON.stringify(fingerprint()) + '\n')
module.exports = { fingerprint }
