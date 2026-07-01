import { Router } from 'express';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/error-handler';
import { gmailService } from '../services/gmail.service';

/**
 * Public OAuth callback — mounted BEFORE requireAuth.
 * Google redirects here without a session cookie; user identity is encoded in CSRF state.
 */
const router: Router = Router();

const WEB_SETTINGS_URL = `${env.CORS_ORIGIN}/settings`;

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const error = typeof req.query.error === 'string' ? req.query.error : null;

    if (error) {
      res.redirect(`${WEB_SETTINGS_URL}?gmail=error&message=${encodeURIComponent(error)}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${WEB_SETTINGS_URL}?gmail=error&message=missing_code`);
      return;
    }

    try {
      const result = await gmailService.exchangeCode(code, state);
      res.redirect(
        `${WEB_SETTINGS_URL}?gmail=connected&email=${encodeURIComponent(result.email)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'oauth_failed';
      res.redirect(`${WEB_SETTINGS_URL}?gmail=error&message=${encodeURIComponent(message)}`);
    }
  }),
);

export const gmailCallbackRouter = router;
