import type { Request, Response, NextFunction } from 'express';
import { isDevelopment } from '../config/env';

/**
 * Request logging middleware — lightweight, no external deps.
 * Logs method, path, status, and duration for observability during development.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();

  res.on('finish', () => {
    const duration = Math.round(performance.now() - start);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    if (isDevelopment || level !== 'info') {
      console.log(
        `[${level}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
      );
    }
  });

  next();
}
