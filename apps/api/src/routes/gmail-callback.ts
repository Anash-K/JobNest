import { Router, type Response } from 'express';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/error-handler';
import { gmailService } from '../services/gmail.service';
import { AppError } from '../utils/errors';

/**
 * Public OAuth callback — mounted BEFORE requireAuth.
 * Google redirects here without a session cookie; user identity is encoded in CSRF state.
 */
const router: Router = Router();

const WEB_SETTINGS_URL = `${env.WEB_APP_URL}/settings`;

/** Redirect back to the frontend settings page, safely encoding query params. */
function redirectToSettings(res: Response, params: Record<string, string>): void {
  const url = new URL(WEB_SETTINGS_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  res.redirect(url.toString());
}

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const oauthError = typeof req.query.error === 'string' ? req.query.error : null;

    if (oauthError) {
      redirectToSettings(res, { gmail: 'error', message: oauthError });
      return;
    }

    if (!code || !state) {
      redirectToSettings(res, { gmail: 'error', message: 'Missing authorization code' });
      return;
    }

    try {
      const result = await gmailService.exchangeCode(code, state);
      redirectToSettings(res, { gmail: 'connected', email: result.email });
    } catch (err) {
      // Log full detail server-side; only surface a safe, known-operational message to the browser.
      console.error('[gmail-oauth-callback]', err);
      const message =
        err instanceof AppError ? err.message : 'Failed to connect Gmail — please try again';
      redirectToSettings(res, { gmail: 'error', message });
    }
  }),
);

export const gmailCallbackRouter = router;
