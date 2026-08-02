import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env, isDevelopment } from '../config/env';

/**
 * Prisma client singleton with PostgreSQL driver adapter (Prisma v7).
 * Connection pool is owned by `pg.Pool` — default max 10 connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient(): PrismaClient {
  const pool =
    globalForPrisma.pool ??
    new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

  if (isDevelopment) {
    globalForPrisma.pool = pool;
  }

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: isDevelopment ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (isDevelopment) {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful disconnect — releases pool connections on shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  if (globalForPrisma.pool) {
    await globalForPrisma.pool.end();
  }
}

/**
 * Lightweight connectivity probe for health checks.
 * Uses $queryRaw — O(1) round trip, no table scan.
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
}> {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { connected: false, latencyMs: Math.round(performance.now() - start) };
  }
}
