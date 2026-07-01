import { Router } from 'express';
import { paramId } from '../utils/params';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { campaignService } from '../services/campaign.service';

const router: Router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await campaignService.list(req.user!.id, req.query as Record<string, unknown>);
    res.json(ok(result));
  }),
);

router.get(
  '/:id',
  requireOwnership('campaign'),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(campaign));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const campaign = await campaignService.create(req.user!.id, body);
    res.status(201).json(ok(campaign));
  }),
);

router.put(
  '/:id',
  requireOwnership('campaign'),
  asyncHandler(async (req, res) => {
    const body = createSchema.partial().parse(req.body);
    const campaign = await campaignService.update(paramId(req.params.id), req.user!.id, body);
    res.json(ok(campaign));
  }),
);

router.delete(
  '/:id',
  requireOwnership('campaign'),
  asyncHandler(async (req, res) => {
    await campaignService.delete(paramId(req.params.id), req.user!.id);
    res.json(ok({ deleted: true }));
  }),
);

export const campaignsRouter = router;
