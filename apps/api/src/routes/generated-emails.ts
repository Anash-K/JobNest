import { Router } from 'express';
import { paramId } from '../utils/params';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { emailBuildService } from '../services/email-build.service';
import { generatedEmailService } from '../services/generated-email.service';

const router: Router = Router();

const buildSchema = z.object({
  leadIds: z.array(z.string().cuid()).min(1),
  templateId: z.string().cuid(),
  resumeId: z.string().cuid().optional(),
  campaignId: z.string().cuid().optional(),
  defaultOverrides: z.record(z.string()).optional(),
});

const patchSchema = z.object({
  subject: z.string().min(1).optional(),
  bodyHtml: z.string().min(1).optional(),
});

const bulkApproveSchema = z.object({
  draftIds: z.array(z.string().cuid()).default([]),
  buildBatchId: z.string().uuid().optional(),
  approveAllValidInBatch: z.boolean().optional(),
});

router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const body = buildSchema.parse(req.body);
    const result = await emailBuildService.validate({ ...body, userId: req.user!.id });
    res.json(ok(result));
  }),
);

router.post(
  '/build',
  asyncHandler(async (req, res) => {
    const body = buildSchema.parse(req.body);
    const result = await emailBuildService.build({ ...body, userId: req.user!.id });
    res.status(201).json(ok(result));
  }),
);

router.post(
  '/rebuild',
  asyncHandler(async (req, res) => {
    const body = buildSchema.extend({ buildBatchId: z.string().uuid() }).parse(req.body);
    const result = await emailBuildService.rebuild(body.buildBatchId, {
      ...body,
      userId: req.user!.id,
    });
    res.json(ok(result));
  }),
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const buildBatchId =
      typeof req.query.buildBatchId === 'string' ? req.query.buildBatchId : undefined;
    const summary = await generatedEmailService.getSummary(req.user!.id, buildBatchId);
    res.json(ok(summary));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await generatedEmailService.list(req.user!.id, req.query as Record<string, unknown>);
    res.json(ok(result));
  }),
);

router.get(
  '/batch/:buildBatchId',
  asyncHandler(async (req, res) => {
    const drafts = await generatedEmailService.listByBatch(
      req.user!.id,
      paramId(req.params.buildBatchId),
    );
    res.json(ok(drafts));
  }),
);

router.get(
  '/:id',
  requireOwnership('generatedEmail'),
  asyncHandler(async (req, res) => {
    const draft = await generatedEmailService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(draft));
  }),
);

router.patch(
  '/:id',
  requireOwnership('generatedEmail'),
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const draft = await generatedEmailService.update(paramId(req.params.id), req.user!.id, body);
    res.json(ok(draft));
  }),
);

router.post(
  '/:id/approve',
  requireOwnership('generatedEmail'),
  asyncHandler(async (req, res) => {
    const draft = await generatedEmailService.approve(paramId(req.params.id), req.user!.id);
    res.json(ok(draft));
  }),
);

router.post(
  '/:id/unapprove',
  requireOwnership('generatedEmail'),
  asyncHandler(async (req, res) => {
    const draft = await generatedEmailService.unapprove(paramId(req.params.id), req.user!.id);
    res.json(ok(draft));
  }),
);

router.post(
  '/bulk-approve',
  asyncHandler(async (req, res) => {
    const body = bulkApproveSchema.parse(req.body);
    let ids = body.draftIds;

    if (body.approveAllValidInBatch && body.buildBatchId) {
      const drafts = await generatedEmailService.listByBatch(req.user!.id, body.buildBatchId);
      ids = drafts.filter((d) => d.status === 'DRAFT' && d.isValid).map((d) => d.id);
    }

    const approved = await generatedEmailService.bulkApprove(req.user!.id, ids, false);
    res.json(ok({ approved, count: approved.length }));
  }),
);

router.delete(
  '/:id',
  requireOwnership('generatedEmail'),
  asyncHandler(async (req, res) => {
    await generatedEmailService.delete(paramId(req.params.id), req.user!.id);
    res.json(ok({ deleted: true }));
  }),
);

export const generatedEmailsRouter = router;
