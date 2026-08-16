import { Router } from 'express';
import { z } from 'zod';
import { paramId } from '../utils/params';
import { asyncHandler } from '../middleware/error-handler';
import { ok } from '../utils/response';
import { userService } from '../services/user.service';

const router: Router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  image: z.string().url().nullable().optional(),
  defaultDelaySeconds: z.number().int().min(5).max(60).optional(),
  defaultResumeId: z.string().cuid().nullable().optional(),
  defaultTemplateId: z.string().cuid().nullable().optional(),
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const profile = await userService.getProfile(req.user!.id);
    res.json(ok(profile));
  }),
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = updateProfileSchema.parse(req.body);
    const profile = await userService.updateProfile(req.user!.id, body);
    res.json(ok(profile));
  }),
);

router.get(
  '/me/sessions',
  asyncHandler(async (req, res) => {
    const sessions = await userService.listSessions(req.user!.id, req.session!.id);
    res.json(ok(sessions));
  }),
);

router.delete(
  '/me/sessions/others',
  asyncHandler(async (req, res) => {
    const result = await userService.revokeOtherSessions(req.user!.id, req.session!.id);
    res.json(ok(result));
  }),
);

router.delete(
  '/me/sessions/:id',
  asyncHandler(async (req, res) => {
    const result = await userService.revokeSession(
      req.user!.id,
      paramId(req.params.id),
      req.session!.id,
    );
    res.json(ok(result));
  }),
);

export const usersRouter = router;
