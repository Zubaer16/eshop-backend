import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import merge from 'lodash.merge';
import { generateOpenApiSpec } from '../shared/openapi/registry';
import logger from './logger';

type JsonObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getRefTarget = (document: unknown, fragment: string): unknown => {
  if (!fragment.startsWith('#/')) {
    throw new Error(`Unsupported OpenAPI ref fragment: ${fragment}`);
  }

  return fragment
    .slice(2)
    .split('/')
    .reduce<unknown>((current, rawSegment) => {
      const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');

      if (!isPlainObject(current) && !Array.isArray(current)) {
        throw new Error(`Unable to resolve OpenAPI ref segment: ${segment}`);
      }

      return (current as Record<string, unknown>)[segment];
    }, document);
};

const resolveLocalFileRefs = (
  value: unknown,
  baseDir: string,
  cache: Map<string, unknown>,
  schemaNames: Set<string>,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveLocalFileRefs(item, baseDir, cache, schemaNames),
    );
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (
    typeof value.$ref === 'string' &&
    value.$ref.includes('/components/schemas/') &&
    value.$ref.includes('#/')
  ) {
    const rawRefName = value.$ref.split('#/')[1];

    if (!rawRefName) {
      throw new Error(`Invalid schema ref: ${value.$ref}`);
    }

    const refName = rawRefName.startsWith('components/schemas/')
      ? rawRefName.slice('components/schemas/'.length)
      : rawRefName;

    schemaNames.add(refName);

    return {
      $ref: `#/components/schemas/${refName}`,
    };
  }

  if (typeof value.$ref === 'string' && value.$ref.startsWith('./')) {
    const [relativePath = '', fragment = ''] = value.$ref.split('#');
    const resolvedPath = path.resolve(baseDir, relativePath);
    const loadedDocument =
      cache.get(resolvedPath) ?? YAML.load(resolvedPath);

    cache.set(resolvedPath, loadedDocument);

    const target = fragment
      ? getRefTarget(loadedDocument, `#${fragment}`)
      : loadedDocument;

    return resolveLocalFileRefs(
      target,
      path.dirname(resolvedPath),
      cache,
      schemaNames,
    );
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      resolveLocalFileRefs(child, baseDir, cache, schemaNames),
    ]),
  );
};

const loadStaticOpenApiSpec = (): JsonObject => {
  const sourceSpecPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
  const sourceSpec = YAML.load(sourceSpecPath) as JsonObject;
  const docsDir = path.dirname(sourceSpecPath);
  const cache = new Map<string, unknown>([[sourceSpecPath, sourceSpec]]);
  const schemaNames = new Set<string>();
  const components = isPlainObject(sourceSpec.components)
    ? sourceSpec.components
    : {};
  const paths = isPlainObject(sourceSpec.paths) ? sourceSpec.paths : {};
  const securitySchemes = isPlainObject(components.securitySchemes)
    ? components.securitySchemes
    : {};
  const sourceSchemas = isPlainObject(components.schemas)
    ? components.schemas
    : {};
  const resolvedSchemas = resolveLocalFileRefs(
    sourceSchemas,
    docsDir,
    cache,
    schemaNames,
  );
  const staticSchemas = isPlainObject(resolvedSchemas) ? resolvedSchemas : {};

  return {
    ...sourceSpec,
    paths: resolveLocalFileRefs(paths, docsDir, cache, schemaNames),
    components: {
      ...components,
      securitySchemes: resolveLocalFileRefs(
        securitySchemes,
        docsDir,
        cache,
        schemaNames,
      ),
      schemas: {
        ...staticSchemas,
        ...Object.fromEntries(
          Array.from(schemaNames, (schemaName) => [
            schemaName,
            staticSchemas[schemaName] ?? { type: 'object' },
          ]),
        ),
      },
    },
  };
};

export const setupSwagger = (app: Express): void => {
  const staticSpec = loadStaticOpenApiSpec();
  const dynamicSpec = generateOpenApiSpec();
  const staticComponents = isPlainObject(staticSpec.components)
    ? staticSpec.components
    : {};
  const dynamicComponents = isPlainObject(dynamicSpec.components)
    ? dynamicSpec.components
    : {};

  const finalSpec = merge({}, staticSpec, {
    components: {
      ...staticComponents,
      ...dynamicComponents,
      securitySchemes: merge(
        {},
        staticComponents.securitySchemes ?? {},
        dynamicComponents.securitySchemes ?? {},
      ),
      schemas: merge(
        {},
        staticComponents.schemas ?? {},
        dynamicComponents.schemas ?? {},
      ),
    },
    paths: merge({}, staticSpec.paths ?? {}, dynamicSpec.paths ?? {}),
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(finalSpec));

  logger.info('🚀 Swagger UI available at: http://localhost:3000/api-docs');
};
