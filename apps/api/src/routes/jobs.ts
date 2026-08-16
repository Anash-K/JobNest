import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { requireCronSecret } from '../middleware/cron-auth';
import { ok } from '../utils/response';
import { gmailReplySyncService } from '../services/gmail-reply-sync.service';

const router: Router = Router();

/** Vercel Cron trigger (hourly) — see apps/api/vercel.json `crons`. GET-only per Vercel Cron's contract. */
router.get(
  '/gmail-reply-sync',
  requireCronSecret,
  asyncHandler(async (_req, res) => {
    const summary = await gmailReplySyncService.run();
    res.json(ok(summary));
  }),
);

export const jobsRouter = router;
