/**
 * Operational error base class.
 * `isOperational` distinguishes expected errors (4xx) from programmer bugs (5xx).
 */
export class AppError extends Error {
  public readonly isOperational: boolean;
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; details?: unknown; isOperational?: boolean },
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
    this.isOperational = options?.isOperational ?? statusCode < 500;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, id ? `${resource} '${id}' not found` : `${resource} not found`, {
      code: 'NOT_FOUND',
    });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, { code: 'VALIDATION_ERROR', details });
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(503, message, { code: 'DATABASE_ERROR', isOperational: true });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, { code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(403, message, { code: 'FORBIDDEN' });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message = 'External service operation failed') {
    super(502, message, { code: 'EXTERNAL_SERVICE_ERROR', isOperational: true });
  }
}

