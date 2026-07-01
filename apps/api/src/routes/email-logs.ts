import { Router } from 'express';
import { paramId } from '../utils/params';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { emailLogService } from '../services/email-log.service';

const router: Router = Router();

router.get(
  '/failed',
  asyncHandler(async (req, res) => {
    const items = await emailLogService.listFailed(req.user!.id);
    res.json(ok(items));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await emailLogService.list(req.user!.id, req.query as Record<string, unknown>);
    res.json(ok(result));
  }),
);

router.get(
  '/:id',
  requireOwnership('emailLog'),
  asyncHandler(async (req, res) => {
    const log = await emailLogService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(log));
  }),
);

export const emailLogsRouter = router;
