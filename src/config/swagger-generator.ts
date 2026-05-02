import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { ZodSchema } from 'zod';
import { Application } from 'express';
import yaml from 'js-yaml';
import logger from './logger';

const getTypeName = (schema: ZodSchema<unknown>): string => {
  return (schema as any)._def?.typeName || (schema as any).constructor?.name || 'unknown';
};

const convertZodToSwagger = (schema: ZodSchema<unknown>, visited = new Set()): object => {
  if (visited.has(schema)) return { $ref: '#/components/schemas/CircularReference' };
  visited.add(schema);

  const typeName = getTypeName(schema);
  const def = (schema as any)._def;

  try {
    // Handle primitive types
    if (typeName === 'ZodString') {
      const result: any = { type: 'string' };
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === 'min') result.minLength = check.value;
          if (check.kind === 'max') result.maxLength = check.value;
          if (check.kind === 'regex') result.pattern = check.regex.source;
          if (check.kind === 'email') result.format = 'email';
          if (check.kind === 'uuid') result.format = 'uuid';
          if (check.kind === 'url') result.format = 'uri';
          if (check.kind === 'cuid') result.format = 'cuid';
          if (check.kind === 'cuid2') result.format = 'cuid2';
          if (check.kind === 'datetime') result.format = 'date-time';
          if (check.kind === 'date') result.format = 'date';
        }
      }
      return result;
    }

    if (typeName === 'ZodNumber') {
      const result: any = { type: 'number' };
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === 'min') result.minimum = check.value;
          if (check.kind === 'max') result.maximum = check.value;
          if (check.kind === 'int') result.type = 'integer';
        }
      }
      return result;
    }

    if (typeName === 'ZodBigInt') {
      return { type: 'integer', format: 'int64' };
    }

    if (typeName === 'ZodBoolean') {
      return { type: 'boolean' };
    }

    if (typeName === 'ZodDate') {
      return { type: 'string', format: 'date-time' };
    }

    if (typeName === 'ZodUndefined') {
      return { type: 'string', nullable: true };
    }

    if (typeName === 'ZodNull') {
      return { nullable: true };
    }

    if (typeName === 'ZodVoid') {
      return {};
    }

    // Handle objects
    if (typeName === 'ZodObject') {
      const properties: Record<string, object> = {};
      const required: string[] = [];
      const shape = (schema as any).shape;

      if (shape) {
        for (const [key, value] of Object.entries(shape)) {
          properties[key] = convertZodToSwagger(value as ZodSchema<unknown>, visited);
          if (!isPropertyOptional(value as ZodSchema<unknown>)) {
            required.push(key);
          }
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    // Handle arrays and tuples
    if (typeName === 'ZodArray') {
      return {
        type: 'array',
        items: convertZodToSwagger(def.innerType as ZodSchema<unknown>, visited),
      };
    }

    if (typeName === 'ZodTuple') {
      const items = def.items?.map((item: any) => convertZodToSwagger(item, visited)) || [];
      return {
        type: 'array',
        items: items.length === 1 ? items[0] : { oneOf: items },
        minItems: items.length,
        maxItems: items.length,
      };
    }

    // Handle optionals and nullables
    if (typeName === 'ZodOptional' || typeName === 'ZodNullable' || typeName === 'ZodDefault') {
      const inner = def.innerType || def.inner;
      const result = convertZodToSwagger(inner as ZodSchema<unknown>, visited);
      if (typeName === 'ZodNullable') {
        return { ...result, nullable: true };
      }
      return result;
    }

    // Handle enums and literals
    if (typeName === 'ZodEnum') {
      return { type: 'string', enum: def.values };
    }

    if (typeName === 'ZodNativeEnum') {
      return { type: 'string', enum: Object.values(def.values) };
    }

    if (typeName === 'ZodLiteral') {
      const valueType = typeof def.value;
      const result: any = { enum: [def.value] };
      if (valueType === 'string') result.type = 'string';
      else if (valueType === 'number') result.type = 'number';
      else if (valueType === 'boolean') result.type = 'boolean';
      return result;
    }

    // Handle unions and intersections
    if (typeName === 'ZodUnion') {
      const options = def.options?.map((opt: any) => convertZodToSwagger(opt, visited)) || [];
      return {
        oneOf: options,
      };
    }

    if (typeName === 'ZodDiscriminatedUnion') {
      const options = def.options?.map((opt: any) => convertZodToSwagger(opt, visited)) || [];
      // For discriminated unions, try to identify the discriminator
      const discriminator = def.discriminator;
      if (discriminator) {
        return {
          oneOf: options,
          discriminator: { propertyName: discriminator },
        };
      }
      return {
        oneOf: options,
      };
    }

    if (typeName === 'ZodIntersection') {
      const left = convertZodToSwagger(def.left, visited);
      const right = convertZodToSwagger(def.right, visited);
      return {
        allOf: [left, right],
      };
    }

    // Handle records and maps
    if (typeName === 'ZodRecord') {
      return {
        type: 'object',
        additionalProperties: convertZodToSwagger(def.valueType as ZodSchema<unknown>, visited),
      };
    }

    if (typeName === 'ZodMap') {
      return {
        type: 'object',
        additionalProperties: convertZodToSwagger(def.valueType as ZodSchema<unknown>, visited),
      };
    }

    if (typeName === 'ZodSet') {
      return {
        type: 'array',
        items: convertZodToSwagger(def.innerType as ZodSchema<unknown>, visited),
        uniqueItems: true,
      };
    }

    // Handle effects and transforms
    if (typeName === 'ZodEffects' || typeName === 'ZodTransform') {
      const inner = def.schema || def.innerType || def.innerTypeDef;
      if (inner) {
        return convertZodToSwagger(inner as ZodSchema<unknown>, visited);
      }
      // If we can't get the inner schema, return a generic object
      return { type: 'object' };
    }

    // Handle lazy schemas (for recursive types)
    if (typeName === 'ZodLazy') {
      const getter = def.getter;
      if (getter) {
        try {
const lazySchema = getter();
           return convertZodToSwagger(lazySchema, visited);
         } catch {
           return { type: 'object' };
         }
      }
      return { type: 'object' };
    }

    // Handle preprocess
    if (typeName === 'ZodPreprocess') {
      const inner = def.schema;
      if (inner) {
        return convertZodToSwagger(inner as ZodSchema<unknown>, visited);
      }
      return { type: 'object' };
    }

    // Handle promise (return the inner type)
    if (typeName === 'ZodPromise') {
      const inner = def.type;
      if (inner) {
        return convertZodToSwagger(inner as ZodSchema<unknown>, visited);
      }
      return { type: 'object' };
    }

    // Fallback for unknown types
    logger.warn(`Unknown Zod type: ${typeName}`);
    return { type: 'object' };
  } catch (e) {
    logger.error(`Error converting schema ${typeName}: ${String(e)}`);
    return { type: 'object' };
  }
};

// Helper function to determine if a property is optional
const isPropertyOptional = (schema: ZodSchema<unknown>): boolean => {
  const typeName = getTypeName(schema);
  return typeName === 'ZodOptional' ||
         typeName === 'ZodNullable' ||
         typeName === 'ZodDefault' ||
         (typeName === 'ZodUnion' && (schema as any)._def.options?.some((opt: any) => getTypeName(opt) === 'ZodUndefined'));
};

const extractModuleName = (filePath: string): string => {
  const parts = filePath.split(path.sep);
  const modulesIndex = parts.indexOf('modules');
  if (modulesIndex !== -1 && parts.length > modulesIndex + 1) {
    return parts[modulesIndex + 1];
  }
  return 'common';
};

const loadValidators = (): Record<string, Record<string, { schema: ZodSchema<unknown>, name: string }>> => {
  const schemas: Record<string, Record<string, { schema: ZodSchema<unknown>, name: string }>> = {};
  
  const scanDir = (dir: string) => {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if ((item.endsWith('.ts') && !item.endsWith('.d.ts')) && 
                   (item.includes('validator') || item.includes('schema') || item.includes('dto'))) {
          loadFile(fullPath);
        }
      }
    } catch { /* empty */ }
  };
  
  const loadFile = (filePath: string) => {
    try {
      const moduleName = extractModuleName(filePath);
      
      delete require.cache[require.resolve(filePath)];
      const module = require(filePath);
      
      if (!schemas[moduleName]) {
        schemas[moduleName] = {};
      }
      
      for (const [key, value] of Object.entries(module)) {
        if (value && typeof value === 'object' && (value as any)._def) {
          const schemaName = key.replace(/Schema$/i, '').replace(/Dto$/i, '');
          schemas[moduleName][schemaName] = { schema: value as ZodSchema<unknown>, name: key };
        }
      }
    } catch (e) {
      console.error(`Error loading ${filePath}:`, e);
    }
  };
  
  scanDir(path.join(process.cwd(), 'src', 'modules'));
  
  return schemas;
};

export const generateSwaggerSpec = (): object => {
  const modules = loadValidators();
  const components: Record<string, Record<string, object>> = { schemas: {} };
  let paths: Record<string, object> = {};
  
  for (const [, schemas] of Object.entries(modules)) {
    for (const [schemaName, { name }] of Object.entries(schemas)) {
      const swaggerSchema = convertZodToSwagger(schemas[schemaName].schema);
      const finalName = name.replace(/Schema$/i, '').replace(/Dto$/i, '');
      if (!components.schemas[finalName]) {
        components.schemas[finalName] = swaggerSchema;
      }
    }
  }
  
  const openApiYamlPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
  if (fs.existsSync(openApiYamlPath)) {
    try {
      const yamlContent = fs.readFileSync(openApiYamlPath, 'utf-8');
      const yamlSpec = yaml.load(yamlContent) as any;
      
      if (yamlSpec.components?.schemas) {
        components.schemas = { ...components.schemas, ...yamlSpec.components.schemas };
      }
       if (yamlSpec.paths) {
         paths = yamlSpec.paths;
       }
     } catch (e) {
      logger.error(`[Swagger] Error loading openapi.yaml: ${String(e)}`);
    }
  }
  
  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'E-Shop API',
      version: '1.0.0',
      description: 'Backend API for E-Shop project - Auto-generated from validators',
    },
    paths,
    components,
  };
  
  return spec;
};

let currentSpec: object | null = null;

export const setupSwaggerUI = (app: Application): void => {
  app.use('/api-docs', swaggerUi.serve);
  
  app.get('/swagger.json', (req, res) => {
    currentSpec = generateSwaggerSpec();
    res.json(currentSpec);
  });
  
  app.get('/api-docs/swagger-initializer.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
      window.onload = function() {
        const ui = SwaggerUIBundle({
          url: "/swagger.json",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.SwaggerUIStandalonePreset
          ],
          layout: "StandaloneLayout"
        });
        window.ui = ui;
        
        setInterval(() => {
          fetch('/swagger.json').then(r => r.json()).then(spec => {
            if (window.ui && window.ui.spec !== spec) {
              window.ui.spec = spec;
              window.ui.dispatch({ spec });
            }
          });
        }, 3000);
      };
    `);
  });
  
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
    swaggerOptions: {
      url: '/swagger.json',
    },
  }));
  
     logger.info('Swagger is running on http://localhost:3000/api-docs');
};

export const getSwaggerSpec = (): object => {
  if (!currentSpec) {
    currentSpec = generateSwaggerSpec();
  }
  return currentSpec;
};

export const reloadSwaggerSpec = (): object => {
  console.log('Reloading swagger spec...');
  currentSpec = generateSwaggerSpec();
  return currentSpec;
};