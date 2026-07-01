import { prisma } from '../lib/prisma';
import { buildPaginationMeta, isPipelineStatus, parseListQuery } from '@jobhunter/shared';
import { NotFoundError, ValidationError } from '../utils/errors';
import { prismaPagination } from '../utils/search';
import type { Application, Prisma } from '../generated/prisma/client';

function buildWhere(userId: string, query: ReturnType<typeof parseListQuery>): Prisma.ApplicationWhereInput {
  const where: Prisma.ApplicationWhereInput = { userId };

  if (query.search) {
    const term = query.search;
    where.OR = [
      { notes: { contains: term, mode: 'insensitive' } },
      {
        jobLead: {
          OR: [
            { companyName: { contains: term, mode: 'insensitive' } },
            { jobTitle: { contains: term, mode: 'insensitive' } },
            { receiverName: { contains: term, mode: 'insensitive' } },
            { receiverEmail: { contains: term, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  if (query.status && query.status.length > 0) {
    where.status = { in: query.status };
  }

  if (query.campaignId) where.campaignId = query.campaignId;

  if (query.dateFrom || query.dateTo) {
    where.appliedDate = {};
    if (query.dateFrom) where.appliedDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.appliedDate.lte = new Date(query.dateTo);
  }

  return where;
}

const include = {
  campaign: { select: { id: true, name: true } },
  jobLead: {
    select: {
      id: true,
      companyName: true,
      jobTitle: true,
      receiverName: true,
      receiverEmail: true,
      pipelineStatus: true,
    },
  },
  generatedEmail: { select: { id: true, status: true, subject: true } },
} as const;

async function assertOwnership(id: string, userId: string): Promise<Application> {
  const app = await prisma.application.findUnique({ where: { id } });
  if (!app || app.userId !== userId) throw new NotFoundError('Application', id);
  return app;
}

export const applicationService = {
  parseQuery(raw: Record<string, unknown>) {
    return parseListQuery(raw);
  },

  async list(userId: string, rawQuery: Record<string, unknown>) {
    const query = this.parseQuery(rawQuery);
    const where = buildWhere(userId, query);

    const [items, total] = await prisma.$transaction([
      prisma.application.findMany({
        where,
        orderBy: { appliedDate: 'desc' },
        ...prismaPagination(query.page, query.limit),
        include,
      }),
      prisma.application.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  async getById(id: string, userId: string) {
    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        ...include,
        resume: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!app || app.userId !== userId) throw new NotFoundError('Application', id);
    return app;
  },

  async update(id: string, userId: string, data: { status?: string; notes?: string }) {
    const existing = await assertOwnership(id, userId);

    if (data.status && !isPipelineStatus(data.status)) {
      throw new ValidationError(`Invalid status: ${data.status}`);
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        status: data.status as never,
        notes: data.notes,
      },
      include,
    });

    if (data.status && existing.jobLeadId) {
      await prisma.jobLead.updateMany({
        where: { id: existing.jobLeadId, userId },
        data: { pipelineStatus: data.status as never },
      });
    }

    return updated;
  },

  async delete(id: string, userId: string) {
    await assertOwnership(id, userId);
    await prisma.application.delete({ where: { id } });
    return { deleted: true };
  },
};
