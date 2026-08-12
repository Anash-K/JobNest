import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/errors';
import { isDevelopment } from '../config/env';

function isPrismaInitError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'PrismaClientInitializationError'
  );
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Internal server error';
}

function getErrorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}

function isPrismaKnownRequestError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'PrismaClientKnownRequestError' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

/**
 * Wrap async route handlers so rejected promises reach the error middleware.
 * Avoids try/catch boilerplate in every route — Express 4 does not catch async errors.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Central error handler — maps known error types to consistent JSON responses.
 * Unknown errors return 500 without leaking stack traces in production.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const error = err;

  // Zod validation errors from shared query parsers / request bodies
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.flatten(),
      },
    });
    return;
  }

  // Intentional application errors
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
        ...(isDevelopment && !error.isOperational ? { stack: error.stack } : {}),
      },
    });
    return;
  }

  // Prisma known errors — map to safe client messages
  if (isPrismaKnownRequestError(error)) {
    const status = error.code === 'P2025' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: {
        message: mapPrismaError(error),
        code: `PRISMA_${error.code}`,
      },
    });
    return;
  }

  if (isPrismaInitError(error)) {
    res.status(503).json({
      success: false,
      error: {
        message: 'Database unavailable',
        code: 'DATABASE_UNAVAILABLE',
      },
    });
    return;
  }

  // Fallback — log full error server-side, generic message to client
  console.error('[unhandled]', error);
  res.status(500).json({
    success: false,
    error: {
      message: isDevelopment ? getErrorMessage(error) : 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(isDevelopment ? { stack: getErrorStack(error) } : {}),
    },
  });
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): string {
  switch (err.code) {
    case 'P2002':
      return 'A record with this value already exists';
    case 'P2025':
      return 'Record not found';
    case 'P2003':
      return 'Related record not found';
    default:
      return 'Database request failed';
  }
}

/**
 * 404 handler for unmatched routes — registered after all routers.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 'ROUTE_NOT_FOUND',
    },
  });
}
