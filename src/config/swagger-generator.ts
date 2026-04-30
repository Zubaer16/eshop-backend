import swaggerJsdoc from 'swagger-jsdoc';
import logger from './logger';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { ZodSchema, z } from 'zod';
import { Application } from 'express';
import yaml from 'js-yaml';

const getTypeName = (schema: ZodSchema<unknown>): string => {
  return (schema as any)._def?.typeName || (schema as any).constructor?.name || 'unknown';
};

const convertZodToSwagger = (schema: ZodSchema<unknown>, visited = new Set()): object => {
  if (visited.has(schema)) return {};
  visited.add(schema);
  
  const typeName = getTypeName(schema);
  const def = (schema as any)._def;
  
  try {
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
        }
      }
      return result;
    }
    
    if (typeName === 'ZodNumber' || typeName === 'ZodInt') {
      const result: any = { type: 'number' };
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === 'min') result.minimum = check.value;
          if (check.kind === 'max') result.maximum = check.value;
        }
      }
      return result;
    }
    
    if (typeName === 'ZodBoolean') {
      return { type: 'boolean' };
    }
    
    if (typeName === 'ZodDate') {
      return { type: 'string', format: 'date-time' };
    }
    
    if (typeName === 'ZodObject') {
      const properties: Record<string, object> = {};
      const required: string[] = [];
      const shape = (schema as any).shape;
      
      if (shape) {
        for (const [key, value] of Object.entries(shape)) {
          const valTypeName = getTypeName(value as ZodSchema<unknown>);
          const isOptional = valTypeName === 'ZodOptional' || valTypeName === 'ZodNullable' || valTypeName === 'ZodDefault';
          
          properties[key] = convertZodToSwagger(value as ZodSchema<unknown>, visited);
          
          if (!isOptional) {
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
    
    if (typeName === 'ZodArray') {
      return {
        type: 'array',
        items: convertZodToSwagger(def.innerType as ZodSchema<unknown>, visited),
      };
    }
    
    if (typeName === 'ZodOptional' || typeName === 'ZodNullable' || typeName === 'ZodDefault') {
      const inner = def.innerType || def.inner;
      const result = convertZodToSwagger(inner as ZodSchema<unknown>, visited);
      if (typeName === 'ZodNullable') {
        return { ...result, nullable: true };
      }
      return result;
    }
    
    if (typeName === 'ZodEnum') {
      return { type: 'string', enum: def.values };
    }
    
    if (typeName === 'ZodNativeEnum') {
      return { type: 'string', enum: Object.values(def.values) };
    }
    
    if (typeName === 'ZodLiteral') {
      return { type: typeof def.value === 'string' ? 'string' : typeof def.value, enum: [def.value] };
    }
    
    if (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') {
      const options = def.options ? def.options : [def];
      return {
        oneOf: options.map((opt: any) => convertZodToSwagger(opt as ZodSchema<unknown>, visited)),
      };
    }
    
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
    
    return {};
  } catch (e) {
    console.error('Error converting schema:', e);
    return {};
  }
};

const extractModuleName = (filePath: string): string => {
  const parts = filePath.split(path.sep);
  const modulesIndex = parts.indexOf('modules');
  if (modulesIndex !== -1 && parts.length > modulesIndex + 1) {
    return parts[modulesIndex + 1];
  }
  return 'common';
};

const extractSchemaName = (schema: ZodSchema<unknown>): string => {
  const typeName = getTypeName(schema);
  return typeName.replace('Zod', '');
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
    } catch (e) {}
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
  
  for (const [moduleName, schemas] of Object.entries(modules)) {
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
      console.log('[Swagger] Loaded additional specs from docs/openapi.yaml');
    } catch (e) {
      console.error('[Swagger] Error loading openapi.yaml:', e);
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