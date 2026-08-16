import { Router } from 'express';
import { paramId } from '../utils/params';
import { asyncHandler } from '../middleware/error-handler';
import { requireOwnership } from '../middleware/ownership';
import { ok } from '../utils/response';
import { replyService } from '../services/reply.service';

const router: Router = Router();

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await replyService.unreadCount(req.user!.id);
    res.json(ok({ count }));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await replyService.list(req.user!.id, req.query as Record<string, unknown>);
    res.json(ok(result));
  }),
);

router.get(
  '/:id',
  requireOwnership('emailReply'),
  asyncHandler(async (req, res) => {
    const reply = await replyService.getById(paramId(req.params.id), req.user!.id);
    res.json(ok(reply));
  }),
);

router.patch(
  '/:id/read',
  requireOwnership('emailReply'),
  asyncHandler(async (req, res) => {
    const reply = await replyService.markRead(paramId(req.params.id), req.user!.id);
    res.json(ok(reply));
  }),
);

export const repliesRouter = router;
