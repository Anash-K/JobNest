import { Router } from 'express';
import { paramId } from '../utils/params';
import { z } from 'zod';
import { LEAD_SOURCE } from '@jobhunter/shared';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { leadService } from '../services/lead.service';

const router: Router = Router();

const leadFieldsSchema = z.object({
  companyName: z.string().min(1),
  receiverName: z.string().optional(),
  receiverEmail: z.string().email().optional().or(z.literal('')),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  salary: z.string().optional(),
  linkedinUrl: z.string().optional(),
  jobUrl: z.string().optional(),
  jobDescription: z.string().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
  customFieldLabels: z.record(z.string()).optional(),
});

const createLeadSchema = leadFieldsSchema.extend({
  campaignId: z.string().cuid().optional(),
  source: z.enum([
    LEAD_SOURCE.MANUAL,
    LEAD_SOURCE.EXCEL_IMPORT,
    LEAD_SOURCE.LINKEDIN,
    LEAD_SOURCE.OTHER,
  ]).optional(),
});

const importLeadsSchema = z.object({
  campaignId: z.string().cuid().optional(),
  skipDuplicates: z.boolean().optional(),
  leads: z.array(leadFieldsSchema).min(1).max(500),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = leadService.parseListQuery(req.query as Record<string, unknown>);
    const result = await leadService.list(req.user!.id, query);
    res.json(ok(result));
  }),
);

router.post(
  '/import/validate',
  asyncHandler(async (req, res) => {
    const body = importLeadsSchema.parse(req.body);
    const result = await leadService.validateImport(req.user!.id, body);
    res.json(ok(result));
  }),
);

router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const body = importLeadsSchema.parse(req.body);
    const result = await leadService.importBulk(req.user!.id, body);
    res.status(201).json(ok(result));
  }),
);

router.get(
  '/:id',
  requireOwnership('jobLead'),
  asyncHandler(async (req, res) => {
    const lead = await leadService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(lead));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createLeadSchema.parse(req.body);
    const lead = await leadService.create(req.user!.id, {
      ...body,
      receiverEmail: body.receiverEmail || undefined,
    });
    res.status(201).json(ok(lead));
  }),
);

router.put(
  '/:id',
  requireOwnership('jobLead'),
  asyncHandler(async (req, res) => {
    const body = createLeadSchema.partial().parse(req.body);
    const lead = await leadService.update(paramId(req.params.id), req.user!.id, {
      ...body,
      receiverEmail: body.receiverEmail || undefined,
    });
    res.json(ok(lead));
  }),
);

router.delete(
  '/:id',
  requireOwnership('jobLead'),
  asyncHandler(async (req, res) => {
    await leadService.delete(paramId(req.params.id), req.user!.id);
    res.json(ok({ deleted: true }));
  }),
);

export const leadsRouter = router;
