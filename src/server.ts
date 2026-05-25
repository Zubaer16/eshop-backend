import { createApp } from './app';
import { config } from './config';
import logger from './config/logger';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/db';

const PORT = config.app.port;

async function startServer() {
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;

  const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    const forceShutdownTimer = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    forceShutdownTimer.unref();

    const closeDatabase = async () => {
      try {
        await disconnectDatabase();
        logger.info('Shutdown completed');
        process.exit(0);
      } catch (shutdownError) {
        logger.error({ err: shutdownError }, 'Shutdown failed');
        process.exit(1);
      }
    };

    if (!server) {
      await closeDatabase();
      return;
    }

    server.close(async (error) => {
      if (error) {
        logger.error({ err: error }, 'HTTP server close failed');
        process.exit(1);
      }

      logger.info('HTTP server closed');
      await closeDatabase();
    });
  };

  try {
    logger.info('Starting EShop Backend...');

    await connectDatabase();

    const app = createApp();
    logger.info('Express app configured');

    server = app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      logger.info(`Environment: ${config.app.nodeEnv}`);
      logger.info('EShop Backend started successfully');
    });

    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
      logger.fatal({ err: error }, 'Uncaught exception');
      void gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ err: reason }, 'Unhandled promise rejection');
      void gracefulShutdown('unhandledRejection');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Server startup failed');
    await disconnectDatabase().catch((disconnectError) => {
      logger.error({ err: disconnectError }, 'Database disconnect after startup failure failed');
    });
    process.exit(1);
  }
}

void startServer();
