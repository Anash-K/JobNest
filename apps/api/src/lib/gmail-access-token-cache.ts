/** Buffer before expiry — refresh slightly early to avoid mid-request failures. */
const EXPIRY_BUFFER_MS = 60_000;

/** Fallback TTL when Google omits expires_in (1 hour per IMPLEMENTATION.md). */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * In-memory access token cache keyed by userId.
 * Access tokens are never persisted — only refresh tokens are encrypted in the DB.
 */
const cache = new Map<string, CachedToken>();

export const gmailAccessTokenCache = {
  get(userId: string): string | null {
    const entry = cache.get(userId);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) cache.delete(userId);
      return null;
    }
    return entry.token;
  },

  set(userId: string, accessToken: string, expiresInSeconds?: number): void {
    const ttlMs =
      typeof expiresInSeconds === 'number' && expiresInSeconds > 0
        ? expiresInSeconds * 1000 - EXPIRY_BUFFER_MS
        : DEFAULT_TTL_MS - EXPIRY_BUFFER_MS;

    cache.set(userId, {
      token: accessToken,
      expiresAt: Date.now() + Math.max(ttlMs, EXPIRY_BUFFER_MS),
    });
  },

  delete(userId: string): void {
    cache.delete(userId);
  },

  /** Test helper — clears all cached tokens. */
  clear(): void {
    cache.clear();
  },
};
