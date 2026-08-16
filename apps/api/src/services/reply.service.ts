import { prisma } from '../lib/prisma';
import { buildPaginationMeta, paginationOffset, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } from '@jobhunter/shared';
import { NotFoundError } from '../utils/errors';
import type { Prisma } from '../generated/prisma/client';

const include = {
  jobLead: { select: { id: true, companyName: true, jobTitle: true } },
  application: { select: { id: true, status: true } },
  emailLog: { select: { id: true, subject: true, sentAt: true, gmailThreadId: true } },
} as const;

interface ParsedReplyQuery {
  page: number;
  limit: number;
  unreadOnly: boolean;
}

function parseQuery(raw: Record<string, unknown>): ParsedReplyQuery {
  const page = Math.max(1, Number.parseInt(String(raw.page ?? DEFAULT_PAGE), 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(String(raw.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  const unreadOnly = raw.unreadOnly === 'true' || raw.unreadOnly === true;
  return { page, limit, unreadOnly };
}

export const replyService = {
  async list(userId: string, rawQuery: Record<string, unknown>) {
    const query = parseQuery(rawQuery);
    const where: Prisma.EmailReplyWhereInput = { userId };
    if (query.unreadOnly) where.isRead = false;

    const [items, total] = await prisma.$transaction([
      prisma.emailReply.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: paginationOffset(query.page, query.limit),
        take: query.limit,
        include,
      }),
      prisma.emailReply.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  async unreadCount(userId: string): Promise<number> {
    return prisma.emailReply.count({ where: { userId, isRead: false } });
  },

  async getById(id: string, userId: string) {
    const reply = await prisma.emailReply.findUnique({ where: { id }, include });
    if (!reply || reply.userId !== userId) throw new NotFoundError('Reply', id);
    return reply;
  },

  async markRead(id: string, userId: string) {
    const reply = await prisma.emailReply.findUnique({ where: { id }, select: { userId: true } });
    if (!reply || reply.userId !== userId) throw new NotFoundError('Reply', id);

    return prisma.emailReply.update({
      where: { id },
      data: { isRead: true },
      include,
    });
  },
};
