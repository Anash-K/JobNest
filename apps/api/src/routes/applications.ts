import { Router } from 'express';
import { z } from 'zod';
import { paramId } from '../utils/params';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { applicationService } from '../services/application.service';

const router: Router = Router();

const patchSchema = z.object({
  status: z.string().optional(),
  notes: z.string().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await applicationService.list(req.user!.id, req.query as Record<string, unknown>);
    res.json(ok(result));
  }),
);

router.get(
  '/:id',
  requireOwnership('application'),
  asyncHandler(async (req, res) => {
    const app = await applicationService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(app));
  }),
);

router.patch(
  '/:id',
  requireOwnership('application'),
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const app = await applicationService.update(paramId(req.params.id), req.user!.id, body);
    res.json(ok(app));
  }),
);

router.delete(
  '/:id',
  requireOwnership('application'),
  asyncHandler(async (req, res) => {
    const result = await applicationService.delete(paramId(req.params.id), req.user!.id);
    res.json(ok(result));
  }),
);

export const applicationsRouter = router;
