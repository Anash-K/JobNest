import { Router } from 'express';
import { z } from 'zod';
import { paramId } from '../utils/params';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { pipelineService } from '../services/pipeline.service';

const router: Router = Router();

const moveSchema = z.object({
  pipelineStatus: z.string(),
  notes: z.string().optional(),
});

const notesSchema = z.object({
  notes: z.string(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const board = await pipelineService.getBoard(req.user!.id, req.query as Record<string, unknown>);
    res.json(ok(board));
  }),
);

router.patch(
  '/leads/:id/move',
  requireOwnership('jobLead', 'id'),
  asyncHandler(async (req, res) => {
    const body = moveSchema.parse(req.body);
    const lead = await pipelineService.moveLead(
      paramId(req.params.id),
      req.user!.id,
      body.pipelineStatus,
      body.notes,
    );
    res.json(ok(lead));
  }),
);

router.patch(
  '/leads/:id/notes',
  requireOwnership('jobLead', 'id'),
  asyncHandler(async (req, res) => {
    const body = notesSchema.parse(req.body);
    const lead = await pipelineService.updateNotes(paramId(req.params.id), req.user!.id, body.notes);
    res.json(ok(lead));
  }),
);

export const pipelineRouter = router;
