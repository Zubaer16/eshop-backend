import dotenv from 'dotenv';
import { envConfig } from './env';
import { constants } from './constant';

dotenv.config();

export const config = {
  env: envConfig,
  constants,
};

export default config;