import { Router } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../lib/auth';

const router = Router();

// Hand off all routing under /api/v1/auth to Better Auth handler
router.all('*', toNodeHandler(auth));

export const authRouter: Router = router;
