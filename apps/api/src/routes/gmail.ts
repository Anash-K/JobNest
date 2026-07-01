import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { ok } from '../utils/response';
import { gmailService } from '../services/gmail.service';
import { googleOAuthConfigService } from '../services/google-oauth-config.service';

const router: Router = Router();

router.get(
  '/oauth-config',
  asyncHandler(async (_req, res) => {
    const config = googleOAuthConfigService.getPublicConfig();
    res.json(ok(config));
  }),
);

router.get(
  '/auth-url',
  asyncHandler(async (req, res) => {
    const url = await gmailService.getAuthUrl(req.user!.id);
    res.json(ok({ url }));
  }),
);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await gmailService.getStatus(req.user!.id);
    res.json(ok(status));
  }),
);

router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const result = await gmailService.verify(req.user!.id);
    res.json(ok(result));
  }),
);

router.delete(
  '/disconnect',
  asyncHandler(async (req, res) => {
    const result = await gmailService.disconnect(req.user!.id);
    res.json(ok(result));
  }),
);

export const gmailRouter = router;
