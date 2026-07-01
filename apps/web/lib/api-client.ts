import type { ApiErrorResponse, ApiResponse, HealthCheckResponse } from '@jobhunter/shared';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export { API_BASE };

/** Default fetch timeout — prevents hung requests from blocking the UI. */
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Typed fetch wrapper with timeout, JSON parsing, and consistent error handling.
 * All API calls go through this client for a single fault-tolerance boundary.
 */
export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    const body = (await response.json()) as ApiResponse<T> | ApiErrorResponse;

    if (!response.ok || !('success' in body) || body.success === false) {
      const errorBody = body as ApiErrorResponse;
      throw new ApiClientError(
        errorBody.error?.message ?? `Request failed (${response.status})`,
        response.status,
        errorBody.error?.code,
        errorBody.error?.details,
      );
    }

    return (body as ApiResponse<T>).data;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;

    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiClientError('Request timed out', 408, 'TIMEOUT');
    }

    if (err instanceof TypeError) {
      throw new ApiClientError(
        'Unable to reach API — is the server running?',
        0,
        'NETWORK_ERROR',
      );
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Health check — used by dashboard status indicator. */
export function getHealth(): Promise<HealthCheckResponse> {
  return apiFetch<HealthCheckResponse>('/health');
}
