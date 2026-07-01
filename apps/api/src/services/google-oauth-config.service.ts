import { env } from '../config/env';
import { ValidationError } from '../utils/errors';

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const DEFAULT_REDIRECT_URI =
  env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/v1/gmail/callback';

/**
 * Google OAuth credentials are now stored ONLY in environment variables —
 * per the architecture decision. There is one Google OAuth Application for
 * the entire platform; users never configure their own credentials.
 */
export const googleOAuthConfigService = {
  getPublicConfig() {
    const configured = Boolean(
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI,
    );
    return {
      configured,
      source: configured ? ('env' as const) : null,
      clientId: env.GOOGLE_CLIENT_ID ?? null,
      redirectUri: env.GOOGLE_REDIRECT_URI ?? null,
      hasClientSecret: Boolean(env.GOOGLE_CLIENT_SECRET),
      defaultRedirectUri: DEFAULT_REDIRECT_URI,
    };
  },

  resolveCredentials(): OAuthCredentials | null {
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI) {
      return {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI,
      };
    }
    return null;
  },

  requireCredentials(): OAuthCredentials {
    const creds = this.resolveCredentials();
    if (!creds) {
      throw new ValidationError(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in the server environment.',
      );
    }
    return creds;
  },
};
