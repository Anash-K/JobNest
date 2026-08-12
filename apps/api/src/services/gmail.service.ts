import { prisma } from '../lib/prisma';
import { gmailAccessTokenCache } from '../lib/gmail-access-token-cache';
import { gmailOAuthState } from '../lib/gmail-oauth-state';
import { encrypt, decrypt } from '../utils/encryption';
import { buildMimeMessage, encodeMimeForGmail } from '../utils/mime';
import { resumeService } from './resume.service';
import { googleOAuthConfigService } from './google-oauth-config.service';
import { ValidationError } from '../utils/errors';

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

function gmailError(message: string, code: string, details?: unknown): ValidationError {
  return new ValidationError(message, { code, ...(details !== undefined ? { details } : {}) });
}

async function parseTokenResponse(res: Response): Promise<TokenResponse> {
  const body = (await res.json()) as TokenResponse;
  if (!res.ok) {
    const reason = body.error_description ?? body.error ?? res.statusText;
    throw gmailError(`OAuth token request failed: ${reason}`, 'GMAIL_OAUTH_ERROR', body);
  }
  if (!body.access_token) {
    throw gmailError('OAuth response missing access token', 'GMAIL_OAUTH_ERROR', body);
  }
  return body;
}

export const gmailService = {
  /** Build the Google OAuth consent URL for this user. */
  async getAuthUrl(userId: string): Promise<string> {
    const config = googleOAuthConfigService.requireCredentials();
    const state = gmailOAuthState.create(userId);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: OAUTH_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  /** Exchange authorization code for tokens and persist encrypted refresh token. */
  async exchangeCode(code: string, state: string): Promise<{ email: string; connected: boolean }> {
    const userId = gmailOAuthState.consume(state);
    const config = googleOAuthConfigService.requireCredentials();

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await parseTokenResponse(tokenRes);
    if (!tokens.refresh_token) {
      throw gmailError(
        'No refresh token received — revoke app access in Google Account and reconnect',
        'GMAIL_OAUTH_ERROR',
      );
    }

    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      throw gmailError('Failed to fetch Google user info', 'GMAIL_OAUTH_ERROR');
    }

    const googleUser = (await userRes.json()) as { email: string };

    await prisma.gmailAccount.upsert({
      where: { userId },
      create: {
        userId,
        email: googleUser.email,
        encryptedRefreshToken: encrypt(tokens.refresh_token),
        scopes: OAUTH_SCOPES,
      },
      update: {
        email: googleUser.email,
        encryptedRefreshToken: encrypt(tokens.refresh_token),
        scopes: OAUTH_SCOPES,
      },
    });

    gmailAccessTokenCache.set(userId, tokens.access_token, tokens.expires_in);

    return { email: googleUser.email, connected: true };
  },

  async getStatus(userId: string) {
    const account = await prisma.gmailAccount.findUnique({ where: { userId } });
    const oauthConfig = googleOAuthConfigService.getPublicConfig();

    if (!account) {
      return {
        connected: false as const,
        email: null,
        oauthConfigured: oauthConfig.configured,
      };
    }

    return {
      connected: true as const,
      email: account.email,
      connectedAt: account.connectedAt,
      oauthConfigured: oauthConfig.configured,
    };
  },

  async getAccount(userId: string) {
    return prisma.gmailAccount.findUnique({ where: { userId } });
  },

  /**
   * Obtain a valid access token — cache first, then refresh via encrypted refresh token.
   * Access tokens are never written to the database.
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const cached = gmailAccessTokenCache.get(userId);
    if (cached) return cached;

    const account = await this.getAccount(userId);
    if (!account) {
      throw gmailError('Gmail is not connected', 'GMAIL_NOT_CONNECTED');
    }

    return this.refreshAccessToken(userId, account.encryptedRefreshToken);
  },

  async refreshAccessToken(userId: string, encryptedRefreshToken: string): Promise<string> {
    const config = googleOAuthConfigService.requireCredentials();
    let refreshToken: string;

    try {
      refreshToken = decrypt(encryptedRefreshToken);
    } catch {
      throw gmailError(
        'Stored Gmail credentials are invalid — reconnect in Settings',
        'GMAIL_NOT_CONNECTED',
      );
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      gmailAccessTokenCache.delete(userId);
      const errBody = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
      const isRevoked =
        errBody.error === 'invalid_grant' ||
        (errBody.error_description?.toLowerCase().includes('revoked') ?? false);

      throw gmailError(
        isRevoked
          ? 'Gmail authorization expired — reconnect in Settings'
          : 'Failed to refresh Gmail token — reconnect in Settings',
        'GMAIL_NOT_CONNECTED',
        errBody,
      );
    }

    const tokens = await parseTokenResponse(tokenRes);
    gmailAccessTokenCache.set(userId, tokens.access_token, tokens.expires_in);
    return tokens.access_token;
  },

  async verify(userId: string) {
    const account = await this.getAccount(userId);
    if (!account) {
      return { connected: false, email: null, valid: false };
    }

    try {
      const token = await this.getValidAccessToken(userId);
      const res = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { connected: true, email: account.email, valid: res.ok };
    } catch {
      return { connected: true, email: account.email, valid: false };
    }
  },

  async disconnect(userId: string) {
    const account = await this.getAccount(userId);
    if (account) {
      try {
        const refreshToken = decrypt(account.encryptedRefreshToken);
        await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
          method: 'POST',
        });
      } catch {
        // Best-effort revocation — always remove local record
      }
      gmailAccessTokenCache.delete(userId);
      await prisma.gmailAccount.delete({ where: { userId } });
    }
    return { disconnected: true };
  },

  /** Send a single email with one automatic retry on expired access token. */
  async sendMessage(
    userId: string,
    params: {
      to: string;
      subject: string;
      bodyHtml: string;
      bodyPlainText: string;
      resumeId: string;
    },
  ): Promise<string> {
    const account = await this.getAccount(userId);
    if (!account) {
      throw gmailError('Gmail is not connected', 'GMAIL_NOT_CONNECTED');
    }

    const resume = await resumeService.getById(params.resumeId, userId);
    const resumeBuffer = await resumeService.getFileBuffer(params.resumeId, userId);
    const mime = await buildMimeMessage({
      from: account.email,
      to: params.to,
      subject: params.subject,
      bodyHtml: params.bodyHtml,
      bodyPlainText: params.bodyPlainText ?? '',
      attachmentBuffer: resumeBuffer,
      attachmentName: resume.fileName,
    });

    const payload = JSON.stringify({ raw: encodeMimeForGmail(mime) });

    const attemptSend = async (accessToken: string): Promise<Response> =>
      fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      });

    let accessToken = await this.getValidAccessToken(userId);
    let res = await attemptSend(accessToken);

    if (res.status === 401) {
      gmailAccessTokenCache.delete(userId);
      accessToken = await this.refreshAccessToken(userId, account.encryptedRefreshToken);
      res = await attemptSend(accessToken);
    }

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) {
        throw gmailError('Gmail rate limit reached', 'GMAIL_LIMIT', err);
      }
      if (res.status === 401) {
        throw gmailError('Gmail authorization expired — reconnect in Settings', 'GMAIL_NOT_CONNECTED', err);
      }
      throw gmailError(`Gmail send failed: ${err}`, 'NETWORK_ERROR', err);
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  },
};
