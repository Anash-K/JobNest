import { Router } from 'express';
import { paramId } from '../utils/params';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { templateService } from '../services/template.service';

const router: Router = Router();

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
});

const previewSchema = z.object({
  templateId: z.string().cuid(),
  leadId: z.string().cuid(),
  defaultOverrides: z.record(z.string()).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const templates = await templateService.list(req.user!.id);
    res.json(ok(templates));
  }),
);

router.get(
  '/sources/available',
  asyncHandler(async (req, res) => {
    const sources = await templateService.getAvailableSources(req.user!.id);
    res.json(ok(sources));
  }),
);

router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const body = previewSchema.parse(req.body);
    const preview = await templateService.previewForLead(
      req.user!.id,
      body.templateId,
      body.leadId,
      body.defaultOverrides,
    );
    res.json(ok(preview));
  }),
);

router.get(
  '/:id',
  requireOwnership('emailTemplate'),
  asyncHandler(async (req, res) => {
    const template = await templateService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(template));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = templateSchema.parse(req.body);
    const template = await templateService.create(req.user!.id, body);
    res.status(201).json(ok(template));
  }),
);

router.put(
  '/:id',
  requireOwnership('emailTemplate'),
  asyncHandler(async (req, res) => {
    const body = templateSchema.partial().parse(req.body);
    const template = await templateService.update(paramId(req.params.id), req.user!.id, body);
    res.json(ok(template));
  }),
);

router.delete(
  '/:id',
  requireOwnership('emailTemplate'),
  asyncHandler(async (req, res) => {
    await templateService.delete(paramId(req.params.id), req.user!.id);
    res.json(ok({ deleted: true }));
  }),
);

router.put(
  '/:id/variable-map',
  requireOwnership('emailTemplate'),
  asyncHandler(async (req, res) => {
    const variableMap = z.record(z.string()).parse(req.body);
    const template = await templateService.updateVariableMap(
      paramId(req.params.id),
      req.user!.id,
      variableMap,
    );
    res.json(ok(template));
  }),
);

router.put(
  '/:id/default-values',
  requireOwnership('emailTemplate'),
  asyncHandler(async (req, res) => {
    const defaultValues = z.record(z.string()).parse(req.body);
    const template = await templateService.updateDefaultValues(
      paramId(req.params.id),
      req.user!.id,
      defaultValues,
    );
    res.json(ok(template));
  }),
);

export const templatesRouter = router;
