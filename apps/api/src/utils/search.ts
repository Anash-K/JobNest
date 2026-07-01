import type { Prisma } from '../generated/prisma/client';
import type { ParsedListQuery } from '@jobhunter/shared';
import { paginationOffset } from '@jobhunter/shared';

/** Build Prisma where clause for lead text search — uses indexed columns with ILIKE. */
export function buildLeadSearchWhere(
  params: Pick<
    ParsedListQuery,
    'search' | 'status' | 'campaignId' | 'dateFrom' | 'dateTo' | 'source'
  >,
): Prisma.JobLeadWhereInput {
  const where: Prisma.JobLeadWhereInput = {};

  if (params.search) {
    const term = params.search;
    where.OR = [
      { companyName: { contains: term, mode: 'insensitive' } },
      { jobTitle: { contains: term, mode: 'insensitive' } },
      { receiverName: { contains: term, mode: 'insensitive' } },
      { receiverEmail: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (params.status && params.status.length > 0) {
    where.pipelineStatus = { in: params.status };
  }

  if (params.campaignId) {
    where.campaignId = params.campaignId;
  }

  if (params.source) {
    where.source = params.source;
  }

  if (params.dateFrom || params.dateTo) {
    where.createdAt = {};
    if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
    if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
  }

  return where;
}

export function prismaPagination(page: number, limit: number) {
  return { skip: paginationOffset(page, limit), take: limit };
}
