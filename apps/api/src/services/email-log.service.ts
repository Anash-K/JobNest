import { prisma } from '../lib/prisma';
import { buildPaginationMeta, parseListQuery } from '@jobhunter/shared';
import { NotFoundError } from '../utils/errors';
import { prismaPagination } from '../utils/search';
import type { Prisma } from '../generated/prisma/client';

function buildWhere(
  userId: string,
  query: ReturnType<typeof parseListQuery> & { logStatus?: string },
): Prisma.EmailLogWhereInput {
  const where: Prisma.EmailLogWhereInput = { userId };

  if (query.search) {
    const term = query.search;
    where.OR = [
      { recipientEmail: { contains: term, mode: 'insensitive' } },
      { subject: { contains: term, mode: 'insensitive' } },
      { jobLead: { companyName: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.logStatus) where.status = query.logStatus as Prisma.EnumEmailLogStatusFilter['equals'];

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  return where;
}

const include = {
  jobLead: { select: { id: true, companyName: true } },
  campaign: { select: { id: true, name: true } },
  generatedEmail: { select: { id: true, status: true } },
} as const;
export const emailLogService = {
  parseQuery(raw: Record<string, unknown>) {
    const base = parseListQuery(raw);
    return {
      ...base,
      logStatus: typeof raw.status === 'string' ? raw.status : undefined,
    };
  },

  async list(userId: string, rawQuery: Record<string, unknown>) {
    const query = this.parseQuery(rawQuery);
    const where = buildWhere(userId, query);

    const [items, total] = await prisma.$transaction([
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...prismaPagination(query.page, query.limit),
        include,
      }),
      prisma.emailLog.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  async listFailed(userId: string, limit = 50) {
    return prisma.emailLog.findMany({
      where: { userId, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include,
    });
  },

  async getById(id: string, userId: string) {
    const log = await prisma.emailLog.findUnique({
      where: { id },
      include: {
        ...include,
        resume: { select: { id: true, name: true, fileName: true } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!log || log.userId !== userId) throw new NotFoundError('Email log', id);
    return log;
  },
};
