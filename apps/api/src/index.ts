import { createApp } from './app';
import { env } from './config/env';
import { disconnectDatabase, prisma } from './lib/prisma';

const app = createApp();

/**
 * HTTP server with graceful shutdown.
 * On SIGTERM/SIGINT: stop accepting connections, finish in-flight requests, disconnect Prisma.
 */
const server = app.listen(env.PORT, () => {
  console.log(`🚀 API listening on http://localhost:${env.PORT}`);
  console.log(`   Health: http://localhost:${env.PORT}/api/v1/health`);
  console.log(`   Environment: ${env.NODE_ENV}`);
});

/** Graceful shutdown timeout — force exit if cleanup hangs. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received — shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  server.close(async (err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
    }

    try {
      await disconnectDatabase();
      console.log('Database disconnected');
    } catch (dbErr) {
      console.error('Error disconnecting database:', dbErr);
    }

    clearTimeout(forceExit);
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Unhandled rejections — log and exit in production to avoid undefined state
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  if (env.NODE_ENV === 'production') {
    void shutdown('unhandledRejection');
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  void shutdown('uncaughtException');
});

// Verify DB is reachable at startup (non-blocking warning)
prisma
  .$queryRaw`SELECT 1`
  .then(() => console.log('✅ Database connection verified'))
  .catch(() =>
    console.warn(
      '⚠️  Database not reachable — run `pnpm db:up` and `pnpm db:migrate`',
    ),
  );
