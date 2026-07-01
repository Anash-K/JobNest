import { Router } from 'express';
import { z } from 'zod';
import { paramId } from '../utils/params';
import { asyncHandler } from '../middleware/error-handler';
import { NotFoundError } from '../utils/errors';
import { ok } from '../utils/response';
import { bulkSendService } from '../services/bulk-send.service';

const router: Router = Router();

const sendSchema = z.object({
  generatedEmailIds: z.array(z.string().cuid()).optional(),
  buildBatchId: z.string().uuid().optional(),
  sendAllApproved: z.boolean().optional(),
  delaySeconds: z.number().int().min(20).max(60).optional(),
});

router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const body = sendSchema.parse(req.body);
    const result = await bulkSendService.validate(req.user!.id, body);
    res.json(ok(result));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = sendSchema.parse(req.body);
    const result = await bulkSendService.start(req.user!.id, body);
    res.status(202).json(ok(result));
  }),
);

router.get(
  '/:bulkSendId/status',
  asyncHandler(async (req, res) => {
    const job = await bulkSendService.getJobStatus(req.user!.id, paramId(req.params.bulkSendId));
    if (!job) {
      throw new NotFoundError('Bulk send job', paramId(req.params.bulkSendId));
    }
    res.json(ok(job));
  }),
);

router.post(
  '/:bulkSendId/retry-failed',
  asyncHandler(async (req, res) => {
    const result = await bulkSendService.retryFailed(req.user!.id, paramId(req.params.bulkSendId));
    res.status(202).json(ok(result));
  }),
);

export const bulkSendRouter = router;
