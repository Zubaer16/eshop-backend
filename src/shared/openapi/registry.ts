import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

type RegisteredZodSchema = z.ZodTypeAny & {
  _def?: {
    openapi?: {
      _internal?: {
        refId?: string;
      };
    };
  };
};

const isRegisteredZodSchema = (value: unknown): value is RegisteredZodSchema => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as RegisteredZodSchema;
  return Boolean(candidate._def?.openapi?._internal?.refId);
};

const collectValidatorFiles = (dirPath: string, bucket: string[]) => {
  if (!fs.existsSync(dirPath)) return;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'validators') {
        collectValidatorFiles(absolutePath, bucket);
        continue;
      }
      collectValidatorFiles(absolutePath, bucket);
      continue;
    }

    if (
      !/\.(js|ts)$/.test(entry.name) ||
      /\.d\.ts$/.test(entry.name) ||
      /\.map$/.test(entry.name)
    ) {
      continue;
    }

    bucket.push(absolutePath);
  }
};

const loadRegisteredSchemas = () => {
  const modulesRoot = path.resolve(__dirname, '..', '..', 'modules');
  const validatorFiles: string[] = [];
  collectValidatorFiles(modulesRoot, validatorFiles);

  const schemas = new Map<string, z.ZodTypeAny>();

  for (const filePath of validatorFiles) {
    const exportsRecord = require(filePath) as Record<string, unknown>;

    for (const value of Object.values(exportsRecord)) {
      if (!isRegisteredZodSchema(value)) continue;

      const refId = value._def?.openapi?._internal?.refId;
      if (!refId || schemas.has(refId)) continue;
      schemas.set(refId, value);
    }
  }

  return Array.from(schemas.values()).map((schema) => ({
    type: 'schema' as const,
    schema,
  }));
};

export const generateOpenApiSpec = () => {
  const generator = new OpenApiGeneratorV3([
    ...registry.definitions,
    ...loadRegisteredSchemas(),
  ]);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'E-Shop API (Dynamic)',
      version: '1.0.0',
      description: 'Dynamically generated API documentation from Zod schemas.',
    },
  });
};

export { z };