import { Router, type IRouter } from 'express';
import type { HealthCheckResponse } from '@jobhunter/shared';
import { checkDatabaseConnection } from '../lib/prisma';
import { asyncHandler } from '../middleware/error-handler';

const router: IRouter = Router();
const START_TIME = Date.now();

/**
 * GET /api/v1/health
 * Used by Docker healthchecks and the web app to verify API + DB availability.
 * Returns 200 when DB is connected, 503 when degraded (API up, DB down).
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const db = await checkDatabaseConnection();

    const payload: HealthCheckResponse = {
      status: db.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      database: db,
      version: process.env.npm_package_version ?? '0.1.0',
    };

    res.status(db.connected ? 200 : 503).json({ success: true, data: payload });
  }),
);

export const healthRouter = router;
