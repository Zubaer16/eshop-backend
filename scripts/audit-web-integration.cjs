'use strict'

// Read-only source audit. Never starts an app, calls an API or writes business data.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const manifest = require('../contracts/web-integration.v1.json')
const { resolveRoots } = require('./check-frontend-alignment.cjs')
const args = process.argv.slice(2)
if (args.some((arg) => !['--json', '--write'].includes(arg))) {
  process.stderr.write(
    'Usage: node scripts/audit-web-integration.cjs [--json] [--write]\n',
  )
  process.exit(2)
}

function walk(directory, predicate) {
  if (!fs.existsSync(directory))
    throw new Error(`Source directory missing: ${directory}`)
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isSymbolicLink())
        throw new Error('Source audit does not follow symbolic links')
      const file = path.join(directory, entry.name)
      return entry.isDirectory()
        ? walk(file, predicate)
        : predicate(file)
          ? [file]
          : []
    })
    .sort()
}
function hash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
function relative(base, file) {
  return path.relative(base, file).split(path.sep).join('/')
}
function decorators(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : []
}
function decoratorCall(node, name) {
  return decorators(node)
    .map((item) => item.expression)
    .find(
      (item) => ts.isCallExpression(item) && item.expression.getText() === name,
    )
}
function literalArgument(call) {
  const value = call?.arguments[0]
  if (value === undefined) return ''
  if (!ts.isStringLiteralLike(value))
    throw new Error('Nonliteral controller route needs manual review')
  return value.text
}
function sourceOperations() {
  const methods = new Map()
  for (const file of walk(path.join(root, 'src'), (f) =>
    f.endsWith('.controller.ts'),
  )) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    for (const node of source.statements) {
      if (!ts.isClassDeclaration(node) || !node.name) continue
      const controller = decoratorCall(node, 'Controller')
      if (!controller) continue
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) continue
        for (const verb of ['Get', 'Post', 'Put', 'Patch', 'Delete']) {
          const route = decoratorCall(member, verb)
          if (!route) continue
          const routePath =
            '/' +
            ['v1', literalArgument(controller), literalArgument(route)]
              .filter(Boolean)
              .join('/')
              .replace(/:([a-zA-Z0-9_]+)/g, '{$1}')
          const operationId = node.name.text + '_' + member.name.getText(source)
          methods.set(operationId, {
            method: verb.toUpperCase(),
            path: routePath,
            file: relative(root, file),
            line:
              source.getLineAndCharacterOfPosition(member.getStart(source))
                .line + 1,
            guardsAndMetadata: [...decorators(node), ...decorators(member)]
              .map((item) => item.getText(source))
              .filter((item) =>
                /UseGuards|ReportAccess|ReportExportAccess|ApiBearerAuth|ApiSecurity|ApiExclude/.test(
                  item,
                ),
              ),
          })
        }
      }
    }
  }
  return methods
}
function frontendInventory(base) {
  const pages = walk(path.join(base, 'app'), (f) =>
    /[/\\]page\.tsx$/.test(f),
  ).map((file) => {
    const segments = relative(path.join(base, 'app'), file)
      .split('/')
      .slice(0, -1)
      .filter((segment) => !/^\(.*\)$/.test(segment))
    return {
      route: '/' + segments.join('/'),
      file: relative(base, file),
      sha256: hash(file),
    }
  })
  const sources = ['app', 'components', 'lib', 'stores', 'hooks'].flatMap(
    (directory) => {
      const full = path.join(base, directory)
      return fs.existsSync(full) ? walk(full, (f) => /\.(ts|tsx)$/.test(f)) : []
    },
  )
  const evidence = sources.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const imports = source.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => statement.moduleSpecifier.text)
    const networkCalls = []
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        /^(fetch|apiRequest|axios(?:\.[a-z]+)?|window\.fetch)$/.test(
          node.expression.getText(source),
        )
      ) {
        networkCalls.push({
          expression: node.expression.getText(source),
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    const fixtureImports = imports.filter((name) =>
      /fixture|preview|(?:^|\/)catalog$|(?:^|\/)store$|commerce-store/.test(
        name,
      ),
    )
    if (!fixtureImports.length && !networkCalls.length) return []
    return [
      {
        file: relative(base, file),
        sha256: hash(file),
        fixtureImports,
        networkCalls,
      },
    ]
  })
  return { pages, evidence }
}
function main() {
  const resolved = resolveRoots()
  const roots = {
    backend: root,
    admin: resolved.admin,
    user: resolved.storefront,
  }
  const specFile = path.join(root, 'artifacts', 'release', 'openapi.json')
  if (!fs.existsSync(specFile))
    throw new Error(
      'Generate the canonical contract first: npm run release:openapi',
    )
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'))
  const methods = sourceOperations()
  const operations = []
  for (const [route, item] of Object.entries(spec.paths || {})) {
    for (const [verb, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(verb)) continue
      const source = methods.get(operation.operationId)
      if (
        !source ||
        source.method !== verb.toUpperCase() ||
        source.path !== route
      ) {
        throw new Error(
          `OpenAPI/source route drift: ${verb.toUpperCase()} ${route}; regenerate OpenAPI`,
        )
      }
      const success = Object.entries(operation.responses || {}).filter(
        ([status]) => /^2\d\d$/.test(status),
      )
      const successSchemaPresent = success.some(([, response]) =>
        Object.values(response.content || {}).some(
          (content) => content.schema && Object.keys(content.schema).length,
        ),
      )
      const features = manifest.features
        .filter((feature) =>
          feature.operationPrefixes.some(
            (prefix) => route === prefix || route.startsWith(prefix + '/'),
          ),
        )
        .map((feature) => feature.id)
      operations.push({
        method: verb.toUpperCase(),
        path: route,
        operationId: operation.operationId,
        tags: operation.tags || [],
        security: operation.security || [],
        successSchemaPresent,
        requestBody: operation.requestBody || null,
        parameters: operation.parameters || [],
        responses: operation.responses || {},
        backendOnly: /webhook/.test(route) || route === '/v1/health',
        features,
        source,
      })
    }
  }
  const unassigned = operations.filter(
    (operation) => !operation.backendOnly && !operation.features.length,
  )
  if (unassigned.length)
    throw new Error(
      `Unmapped API operations: ${unassigned.map((o) => o.method + ' ' + o.path).join(', ')}`,
    )
  const apps = {
    user: frontendInventory(roots.user),
    admin: frontendInventory(roots.admin),
  }
  for (const [app, inventory] of Object.entries(apps)) {
    for (const page of inventory.pages) {
      const features = manifest.features.filter((feature) =>
        feature[app + 'Routes'].includes(page.route),
      )
      if (!features.length)
        throw new Error(`Unmapped ${app} page: ${page.route}`)
      page.features = features.map((feature) => feature.id)
    }
    for (const feature of manifest.features) {
      for (const route of feature[app + 'Routes']) {
        if (!inventory.pages.some((page) => page.route === route))
          throw new Error(`Missing declared ${app} route: ${route}`)
      }
    }
  }
  for (const feature of manifest.features) {
    for (const prefix of feature.operationPrefixes) {
      if (
        !operations.some(
          (operation) =>
            operation.path === prefix ||
            operation.path.startsWith(prefix + '/'),
        )
      ) {
        throw new Error(
          `API prefix not implemented for ${feature.id}: ${prefix}`,
        )
      }
    }
    for (const source of feature.sourceFiles) {
      if (!fs.existsSync(path.resolve(root, source)))
        throw new Error(`Missing source evidence: ${source}`)
    }
  }
  const report = {
    schema: 1,
    manifestVersion: manifest.version,
    generatedAt: new Date().toISOString(),
    scope: 'SOURCE_AUDIT_ONLY',
    roots,
    canonicalOpenAPI: {
      file: relative(root, specFile),
      sha256: hash(specFile),
    },
    totals: {
      userPages: apps.user.pages.length,
      adminPages: apps.admin.pages.length,
      featureGroups: manifest.features.length,
      operations: operations.length,
      successSchemaPresent: operations.filter((o) => o.successSchemaPresent)
        .length,
      successSchemaAbsent: operations.filter((o) => !o.successSchemaPresent)
        .length,
      gaps: manifest.gaps.length,
    },
    apps,
    operations,
    gaps: manifest.gaps,
    plannedSurfaces: manifest.plannedSurfaces,
    limits: [
      'No API/DB/browser workflow executed by this audit.',
      'Schema presence does not prove complete DTO fields or authorization.',
      'Permission metadata must be checked against the referenced guard/service.',
      'Missing response schemas include acknowledgements/backend-only operations; triage before adding DTOs.',
    ],
  }
  if (args.includes('--write')) {
    const directory = path.join(root, 'validation', 'web-integration')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(
      path.join(directory, 'audit.json'),
      JSON.stringify(report, null, 2) + '\n',
    )
  }
  process.stdout.write(
    args.includes('--json')
      ? JSON.stringify(report, null, 2) + '\n'
      : JSON.stringify({
          status: 'SOURCE_AUDIT_COMPLETE',
          ...report.totals,
          note: report.scope,
        }) + '\n',
  )
}
try {
  main()
} catch (error) {
  process.stderr.write(`Web integration audit failed: ${error.message}\n`)
  process.exitCode = 1
}
