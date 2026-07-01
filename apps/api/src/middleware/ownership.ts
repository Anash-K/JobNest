import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../utils/errors';
import { paramId } from '../utils/params';
import { asyncHandler } from './error-handler';

type OwnableResource =
  | 'campaign'
  | 'jobLead'
  | 'emailTemplate'
  | 'resume'
  | 'generatedEmail'
  | 'application'
  | 'emailLog';

const RESOURCE_LABELS: Record<OwnableResource, string> = {
  campaign: 'Campaign',
  jobLead: 'Lead',
  emailTemplate: 'Template',
  resume: 'Resume',
  generatedEmail: 'Generated email',
  application: 'Application',
  emailLog: 'Email log',
};

async function findResourceUserId(
  resource: OwnableResource,
  id: string,
): Promise<string | null> {
  switch (resource) {
    case 'campaign': {
      const row = await prisma.campaign.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'jobLead': {
      const row = await prisma.jobLead.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'emailTemplate': {
      const row = await prisma.emailTemplate.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'resume': {
      const row = await prisma.resume.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'generatedEmail': {
      const row = await prisma.generatedEmail.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'application': {
      const row = await prisma.application.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'emailLog': {
      const row = await prisma.emailLog.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    }
    default: {
      const _exhaustive: never = resource;
      return _exhaustive;
    }
  }
}

/**
 * Verifies the authenticated user owns the resource identified by a route param.
 * Returns 404 (never 403) when the record is missing or belongs to another tenant.
 */
export function requireOwnership(
  resource: OwnableResource,
  paramName = 'id',
): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new NotFoundError(RESOURCE_LABELS[resource], paramId(req.params[paramName]));
    }

    const id = paramId(req.params[paramName]);
    const ownerId = await findResourceUserId(resource, id);

    if (!ownerId || ownerId !== userId) {
      throw new NotFoundError(RESOURCE_LABELS[resource], id);
    }

    next();
  });
}
