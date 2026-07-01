import { prisma } from '../lib/prisma';
import { buildPaginationMeta, parseListQuery, type ParsedListQuery } from '@jobhunter/shared';
import { NotFoundError } from '../utils/errors';
import { prismaPagination } from '../utils/search';
import type { Campaign, Prisma } from '../generated/prisma/client';

async function assertOwnership(id: string, userId: string): Promise<Campaign> {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || campaign.userId !== userId) throw new NotFoundError('Campaign', id);
  return campaign;
}

function buildWhere(userId: string, query: ParsedListQuery): Prisma.CampaignWhereInput {
  const where: Prisma.CampaignWhereInput = { userId };

  if (query.search) {
    const term = query.search;
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  return where;
}

export const campaignService = {
  parseListQuery(raw: Record<string, unknown>) {
    return parseListQuery(raw);
  },

  async list(userId: string, rawQuery: Record<string, unknown> = {}) {
    const query = this.parseListQuery(rawQuery);
    const where = buildWhere(userId, query);

    const [items, total] = await prisma.$transaction([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...prismaPagination(query.page, query.limit),
        include: {
          _count: { select: { leads: true, generatedEmails: true } },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  async getById(id: string, userId: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { _count: { select: { leads: true, generatedEmails: true } } },
    });
    if (!campaign || campaign.userId !== userId) throw new NotFoundError('Campaign', id);
    return campaign;
  },

  async create(userId: string, data: { name: string; description?: string }) {
    return prisma.campaign.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
      },
    });
  },

  async update(id: string, userId: string, data: { name?: string; description?: string }) {
    await assertOwnership(id, userId);
    return prisma.campaign.update({ where: { id }, data });
  },

  async delete(id: string, userId: string) {
    await assertOwnership(id, userId);
    return prisma.campaign.delete({ where: { id } });
  },
};
