import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const server = app.listen(env.port, () => {
  logger.info(`Backend listening on http://localhost:${env.port}`);
});

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  server.close(() => process.exit(1));
});
