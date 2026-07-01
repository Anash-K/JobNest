import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';
import { UnauthorizedError } from '../utils/errors';

/**
 * Converts Express IncomingHttpHeaders (Node.js) to the Web API Headers object
 * that Better Auth's getSession() expects.
 */
function toWebHeaders(expressHeaders: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(expressHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function parseRole(value: unknown): 'USER' | 'ADMIN' {
  return value === 'ADMIN' ? 'ADMIN' : 'USER';
}

/**
 * Authentication gate for all business API endpoints.
 * Resolves the Better Auth session from the incoming Cookie header,
 * attaches user + session context to req, and rejects unauthenticated
 * requests with a 401 UnauthorizedError.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: toWebHeaders(req.headers as Record<string, string | string[] | undefined>),
    });

    if (!session?.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userRecord = session.user as typeof session.user & {
      role?: string;
    };

    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: parseRole(userRecord.role),
      emailVerified: session.user.emailVerified,
      image: session.user.image ?? null,
    };
    req.session = {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
      token: session.session.token,
      createdAt: session.session.createdAt,
      updatedAt: session.session.updatedAt,
      userId: session.session.userId,
    };

    next();
  } catch (error) {
    next(error);
  }
}
