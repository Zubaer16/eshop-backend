import app from './app';
import { envConfig } from './config/env';
import logger from './config/logger';
import { prisma } from './infrastructure/database/db';

const PORT = envConfig.PORT;

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received - shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
  });

  await prisma.$disconnect();
  logger.info('Prisma disconnected');

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();

  process.exit(0);
}

process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
