import dotenv from 'dotenv';
import { envConfig } from './env';
import { constants } from './constant';
import { swaggerConfig } from './swagger';

dotenv.config();

export const config = {
  env: envConfig,
  constants,
  swagger: swaggerConfig,
};

export default config;