import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

/**
 * Authenticates the Vercel Cron trigger for background job endpoints.
 * Fails closed — if CRON_SECRET isn't configured, every request is rejected
 * rather than silently accepting unauthenticated triggers.
 */
export function requireCronSecret(req: Request, _res: Response, next: NextFunction): void {
  const expected = env.CRON_SECRET;
  const header = req.headers.authorization;

  if (!expected || header !== `Bearer ${expected}`) {
    throw new UnauthorizedError('Invalid or missing cron credentials');
  }

  next();
}
