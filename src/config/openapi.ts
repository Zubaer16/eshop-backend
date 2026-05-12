import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { Application } from 'express';
import { registry } from './openapi-registry';
import logger from './logger';

export function generateOpenApiSpec(): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'E-Shop API',
      version: '1.0.0',
      description: 'Backend API for E-Shop project',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development server' },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Products', description: 'Product management endpoints' },
    ],
  });
}

export function generateSwaggerJson(outputPath?: string): object {
  const spec = generateOpenApiSpec();
  const filePath = outputPath || path.join(process.cwd(), 'swagger.json');
  fs.writeFileSync(filePath, JSON.stringify(spec, null, 2), 'utf-8');
  logger.info(`Swagger spec generated at ${filePath}`);
  return spec;
}

export function setupSwaggerUI(app: Application): void {
  const spec = generateOpenApiSpec();

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

  app.get('/swagger.json', (_req, res) => {
    res.json(generateOpenApiSpec());
  });

  logger.info('Swagger UI running at http://localhost:3000/api-docs');
}
