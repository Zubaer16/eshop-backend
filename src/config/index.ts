import { envConfig } from './env';
import { constants } from './constants';

export const config = {
  env: envConfig,
  constants,
  app: {
    port: envConfig.PORT,
    nodeEnv: envConfig.NODE_ENV,
    isDevelopment: envConfig.NODE_ENV === 'development',
    isProduction: envConfig.NODE_ENV === 'production',
    apiPrefix: constants.API_PREFIX,
    corsOrigin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
      : ['http://localhost:3000', 'http://localhost:3001'],
  },
};

export default config;
