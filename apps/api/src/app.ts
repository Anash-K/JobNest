import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requestLogger } from './middleware/request-logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { requireAuth } from './middleware/auth';
import { campaignsRouter } from './routes/campaigns';
import { leadsRouter } from './routes/leads';
import { resumesRouter } from './routes/resumes';
import { templatesRouter } from './routes/templates';
import { generatedEmailsRouter } from './routes/generated-emails';
import { pipelineRouter } from './routes/pipeline';
import { gmailRouter } from './routes/gmail';
import { gmailCallbackRouter } from './routes/gmail-callback';
import { bulkSendRouter } from './routes/bulk-send';
import { emailLogsRouter } from './routes/email-logs';
import { applicationsRouter } from './routes/applications';
import { analyticsRouter } from './routes/analytics';
import { usersRouter } from './routes/users';

/**
 * Express application factory.
 * Separated from index.ts so the app can be imported in tests without listening.
 */
export function createApp(): express.Application {
  const app = express();

  // Security headers — personal app still benefits from baseline hardening
  app.use(helmet());

  // CORS — allow credentials so Better Auth session cookies are sent cross-origin
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    }),
  );

  // Body parsers with sane limits — prevents large payload DoS on local server
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(requestLogger);

  // API v1 routes — feature routers mount here in later phases
  const v1 = express.Router();
  v1.use('/health', healthRouter);
  v1.use('/auth', authRouter);
  // OAuth callback is public — user identity comes from CSRF state, not session cookie
  v1.use('/gmail', gmailCallbackRouter);

  // Authenticated endpoints gate
  v1.use(requireAuth);

  v1.use('/campaigns', campaignsRouter);
  v1.use('/leads', leadsRouter);
  v1.use('/resumes', resumesRouter);
  v1.use('/templates', templatesRouter);
  v1.use('/generated-emails', generatedEmailsRouter);
  v1.use('/pipeline', pipelineRouter);
  v1.use('/gmail', gmailRouter);
  v1.use('/bulk-send', bulkSendRouter);
  v1.use('/email-logs', emailLogsRouter);
  v1.use('/applications', applicationsRouter);
  v1.use('/analytics', analyticsRouter);
  v1.use('/users', usersRouter);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
