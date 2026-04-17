import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerConfig } from '../src/config/swagger';
import { authComponents, authEndpoints } from './docs/auth';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: swaggerConfig.title,
      version: swaggerConfig.version,
      description: swaggerConfig.description,
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      ...authComponents,
    },
    paths: {
      ...authEndpoints,
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
