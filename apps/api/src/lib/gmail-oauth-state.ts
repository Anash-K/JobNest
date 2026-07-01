import crypto from 'crypto';
import { ValidationError } from '../utils/errors';

const STATE_TTL_MS = 10 * 60 * 1000;

/** CSRF state store for OAuth callback — maps state → userId. */
const states = new Map<string, { userId: string; expires: number }>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [state, { expires }] of states) {
    if (expires < now) states.delete(state);
  }
}

export const gmailOAuthState = {
  /** Create a one-time CSRF state token bound to a user. */
  create(userId: string): string {
    pruneExpired();
    const state = crypto.randomBytes(24).toString('hex');
    states.set(state, { userId, expires: Date.now() + STATE_TTL_MS });
    return state;
  },

  /** Validate and consume state — returns the associated userId. */
  consume(state: string): string {
    pruneExpired();
    const entry = states.get(state);
    if (!entry || entry.expires < Date.now()) {
      throw new ValidationError('Invalid or expired OAuth state');
    }
    states.delete(state);
    return entry.userId;
  },

  /** Test helper — clears pending OAuth states. */
  clear(): void {
    states.clear();
  },
};
