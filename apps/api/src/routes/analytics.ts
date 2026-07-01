import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler';
import { ok } from '../utils/response';
import { analyticsService } from '../services/analytics.service';

const router: Router = Router();

const querySchema = z.object({
  campaignId: z.string().cuid().optional(),
  search: z.string().optional(),
});

const limitSchema = z.object({
  campaignId: z.string().cuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { campaignId } = querySchema.parse(req.query);
    const summary = await analyticsService.getSummary(req.user!.id, campaignId);
    res.json(ok(summary));
  }),
);

router.get(
  '/draft-funnel',
  asyncHandler(async (req, res) => {
    const { campaignId } = querySchema.parse(req.query);
    const funnel = await analyticsService.getDraftFunnel(req.user!.id, campaignId);
    res.json(ok(funnel));
  }),
);

router.get(
  '/applications-by-month',
  asyncHandler(async (req, res) => {
    const { campaignId } = querySchema.parse(req.query);
    const data = await analyticsService.getApplicationsByMonth(req.user!.id, campaignId);
    res.json(ok(data));
  }),
);

router.get(
  '/applications-by-campaign',
  asyncHandler(async (req, res) => {
    const data = await analyticsService.getApplicationsByCampaign(req.user!.id);
    res.json(ok(data));
  }),
);

router.get(
  '/pipeline-distribution',
  asyncHandler(async (req, res) => {
    const { campaignId } = querySchema.parse(req.query);
    const data = await analyticsService.getPipelineDistribution(req.user!.id, campaignId);
    res.json(ok(data));
  }),
);

router.get(
  '/recent-applications',
  asyncHandler(async (req, res) => {
    const { campaignId, limit } = limitSchema.parse(req.query);
    const data = await analyticsService.getRecentApplications(req.user!.id, campaignId, limit);
    res.json(ok(data));
  }),
);

router.get(
  '/failed-emails',
  asyncHandler(async (req, res) => {
    const { campaignId, limit } = limitSchema.parse(req.query);
    const data = await analyticsService.getFailedEmails(req.user!.id, campaignId, limit);
    res.json(ok(data));
  }),
);

router.get(
  '/recent-activity',
  asyncHandler(async (req, res) => {
    const { campaignId, limit, search } = limitSchema.parse(req.query);
    const data = await analyticsService.getRecentActivity(req.user!.id, {
      campaignId,
      limit,
      search,
    });
    res.json(ok(data));
  }),
);

export const analyticsRouter = router;
