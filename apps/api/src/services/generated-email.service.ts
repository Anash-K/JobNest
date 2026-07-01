import { prisma } from '../lib/prisma';
import {
  EDITABLE_GENERATED_EMAIL_STATUSES,
  buildPaginationMeta,
  computePreviewHash,
  parseListQuery,
  type GeneratedEmailStatus,
  type ParsedListQuery,
} from '@jobhunter/shared';
import { NotFoundError, ValidationError } from '../utils/errors';
import { templateService } from './template.service';
import type { GeneratedEmail, Prisma } from '../generated/prisma/client';
import { prismaPagination } from '../utils/search';

function buildGeneratedEmailWhere(
  userId: string,
  query: ParsedListQuery & { buildBatchId?: string; isValid?: string; draftStatus?: string; leadId?: string },
): Prisma.GeneratedEmailWhereInput {
  const where: Prisma.GeneratedEmailWhereInput = { userId };

  if (query.buildBatchId) where.buildBatchId = query.buildBatchId;
  if (query.leadId) where.leadId = query.leadId;
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.isValid === 'true') where.isValid = true;
  if (query.isValid === 'false') where.isValid = false;
  if (query.draftStatus) where.status = query.draftStatus as Prisma.EnumGeneratedEmailStatusFilter['equals'];

  if (query.search) {
    const term = query.search;
    where.OR = [
      { subject: { contains: term, mode: 'insensitive' } },
      { recipientEmail: { contains: term, mode: 'insensitive' } },
      { lead: { companyName: { contains: term, mode: 'insensitive' } } },
      { lead: { receiverName: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  return where;
}

const draftInclude = {
  lead: { select: { id: true, companyName: true, receiverName: true, jobTitle: true } },
  resume: { select: { id: true, name: true, fileName: true } },
  campaign: { select: { id: true, name: true } },
  template: { select: { id: true, name: true, detectedVars: true } },
} as const;

async function getOwnedDraft(id: string, userId: string): Promise<GeneratedEmail> {
  const draft = await prisma.generatedEmail.findUnique({ where: { id } });
  if (!draft || draft.userId !== userId) throw new NotFoundError('Generated email', id);
  return draft;
}

export const generatedEmailService = {
  parseListQuery(raw: Record<string, unknown>) {
    const base = parseListQuery(raw);
    return {
      ...base,
      buildBatchId: typeof raw.buildBatchId === 'string' ? raw.buildBatchId : undefined,
      leadId: typeof raw.leadId === 'string' ? raw.leadId : undefined,
      isValid: typeof raw.isValid === 'string' ? raw.isValid : undefined,
      draftStatus: typeof raw.status === 'string' ? raw.status : undefined,
    };
  },

  async list(userId: string, rawQuery: Record<string, unknown>) {
    const query = this.parseListQuery(rawQuery);
    const where = buildGeneratedEmailWhere(userId, query);

    const [items, total] = await prisma.$transaction([
      prisma.generatedEmail.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...prismaPagination(query.page, query.limit),
        include: draftInclude,
      }),
      prisma.generatedEmail.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  async getSummary(userId: string, buildBatchId?: string) {
    const where: Prisma.GeneratedEmailWhereInput = { userId };
    if (buildBatchId) where.buildBatchId = buildBatchId;

    const [totalGenerated, validDrafts, invalidDrafts, approvedDrafts, sentDrafts, failedDrafts] =
      await prisma.$transaction([
        prisma.generatedEmail.count({ where: { ...where, status: 'DRAFT' } }),
        prisma.generatedEmail.count({ where: { ...where, status: 'DRAFT', isValid: true } }),
        prisma.generatedEmail.count({ where: { ...where, status: 'DRAFT', isValid: false } }),
        prisma.generatedEmail.count({ where: { ...where, status: 'APPROVED' } }),
        prisma.generatedEmail.count({ where: { ...where, status: 'SENT' } }),
        prisma.generatedEmail.count({ where: { ...where, status: 'FAILED' } }),
      ]);

    return {
      totalGenerated: totalGenerated + approvedDrafts + sentDrafts + failedDrafts,
      validDrafts,
      invalidDrafts,
      approvedDrafts,
      pendingApproval: validDrafts,
      sentDrafts,
      failedDrafts,
    };
  },

  async getById(id: string, userId: string) {
    const draft = await prisma.generatedEmail.findUnique({
      where: { id },
      include: draftInclude,
    });
    if (!draft || draft.userId !== userId) throw new NotFoundError('Generated email', id);
    return draft;
  },

  async update(id: string, userId: string, data: { subject?: string; bodyHtml?: string }) {
    const draft = await getOwnedDraft(id, userId);

    if (!(EDITABLE_GENERATED_EMAIL_STATUSES as readonly GeneratedEmailStatus[]).includes(draft.status)) {
      throw new ValidationError(`Cannot edit draft with status ${draft.status}`);
    }

    const subject = data.subject ?? draft.subject;
    const bodyHtml = data.bodyHtml ?? draft.bodyHtml;
    const bodyPlainText = templateService.htmlToPlainText(bodyHtml);

    const statusUpdate =
      draft.status === 'APPROVED'
        ? { status: 'DRAFT' as const, approvedAt: null }
        : {};

    return prisma.generatedEmail.update({
      where: { id },
      data: {
        subject,
        bodyHtml,
        bodyPlainText,
        previewHash: computePreviewHash(subject, bodyHtml, draft.recipientEmail),
        isValid: true,
        missingVariables: [],
        ...statusUpdate,
      },
      include: draftInclude,
    });
  },

  async approve(id: string, userId: string) {
    const draft = await getOwnedDraft(id, userId);

    if (draft.status !== 'DRAFT') {
      throw new ValidationError('Only DRAFT emails can be approved');
    }
    if (!draft.isValid) {
      throw new ValidationError('Cannot approve invalid draft — fix missing variables first', {
        missing: draft.missingVariables,
      });
    }

    return prisma.generatedEmail.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() },
      include: draftInclude,
    });
  },

  async unapprove(id: string, userId: string) {
    const draft = await getOwnedDraft(id, userId);

    if (draft.status !== 'APPROVED') {
      throw new ValidationError('Only APPROVED emails can be unapproved');
    }

    return prisma.generatedEmail.update({
      where: { id },
      data: { status: 'DRAFT', approvedAt: null },
      include: draftInclude,
    });
  },

  async bulkApprove(userId: string, draftIds: string[], approveAllValidInBatch = false) {
    let ids = draftIds;

    if (approveAllValidInBatch && draftIds.length === 1) {
      const batchId = draftIds[0];
      const drafts = await prisma.generatedEmail.findMany({
        where: { userId, buildBatchId: batchId, status: 'DRAFT', isValid: true },
        select: { id: true },
      });
      ids = drafts.map((d) => d.id);
    }

    if (ids.length === 0) throw new ValidationError('No drafts to approve');

    const drafts = await prisma.generatedEmail.findMany({
      where: { id: { in: ids }, userId },
    });

    if (drafts.length !== ids.length) {
      throw new NotFoundError('Generated email', ids.find((id) => !drafts.some((d) => d.id === id)) ?? 'unknown');
    }

    const invalid = drafts.filter((d) => d.status !== 'DRAFT' || !d.isValid);
    if (invalid.length > 0) {
      throw new ValidationError(`${invalid.length} draft(s) cannot be approved`, {
        ids: invalid.map((d) => d.id),
      });
    }

    const now = new Date();
    await prisma.generatedEmail.updateMany({
      where: { id: { in: ids }, userId },
      data: { status: 'APPROVED', approvedAt: now },
    });

    return prisma.generatedEmail.findMany({
      where: { id: { in: ids }, userId },
      include: draftInclude,
    });
  },

  async delete(id: string, userId: string) {
    const draft = await getOwnedDraft(id, userId);
    if (!(EDITABLE_GENERATED_EMAIL_STATUSES as readonly GeneratedEmailStatus[]).includes(draft.status)) {
      throw new ValidationError(`Cannot delete draft with status ${draft.status}`);
    }
    return prisma.generatedEmail.delete({ where: { id } });
  },

  async listByBatch(userId: string, buildBatchId: string) {
    return prisma.generatedEmail.findMany({
      where: { userId, buildBatchId },
      orderBy: { createdAt: 'asc' },
      include: draftInclude,
    });
  },
};
