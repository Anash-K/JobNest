import { prisma } from '../lib/prisma';
import {
  PIPELINE_STATUS_ORDER,
  isPipelineStatus,
  parseListQuery,
  type PipelineStatus,
} from '@jobhunter/shared';
import { buildLeadSearchWhere } from '../utils/search';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface PipelineCard {
  id: string;
  companyName: string;
  receiverName: string | null;
  receiverEmail: string | null;
  jobTitle: string | null;
  notes: string | null;
  pipelineStatus: PipelineStatus;
  campaign: { id: string; name: string } | null;
  draftCount: number;
  approvedDraftCount: number;
  createdAt: Date;
}

function toCard(lead: {
  id: string;
  companyName: string;
  receiverName: string | null;
  receiverEmail: string | null;
  jobTitle: string | null;
  notes: string | null;
  pipelineStatus: PipelineStatus;
  createdAt: Date;
  campaign: { id: string; name: string } | null;
  generatedEmails: { status: string }[];
}): PipelineCard {
  const draftCount = lead.generatedEmails.filter((e) => e.status === 'DRAFT').length;
  const approvedDraftCount = lead.generatedEmails.filter((e) => e.status === 'APPROVED').length;

  return {
    id: lead.id,
    companyName: lead.companyName,
    receiverName: lead.receiverName,
    receiverEmail: lead.receiverEmail,
    jobTitle: lead.jobTitle,
    notes: lead.notes,
    pipelineStatus: lead.pipelineStatus,
    campaign: lead.campaign,
    draftCount,
    approvedDraftCount,
    createdAt: lead.createdAt,
  };
}

async function getOwnedLead(id: string, userId: string) {
  const lead = await prisma.jobLead.findUnique({ where: { id } });
  if (!lead || lead.userId !== userId) throw new NotFoundError('Lead', id);
  return lead;
}

export const pipelineService = {
  parseQuery(raw: Record<string, unknown>) {
    return parseListQuery(raw);
  },

  async getBoard(userId: string, rawQuery: Record<string, unknown>) {
    const query = this.parseQuery(rawQuery);
    const where = { ...buildLeadSearchWhere(query), userId };

    const leads = await prisma.jobLead.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true } },
        generatedEmails: { select: { status: true } },
      },
    });

    const columns = Object.fromEntries(
      PIPELINE_STATUS_ORDER.map((status) => [status, [] as PipelineCard[]]),
    ) as Record<PipelineStatus, PipelineCard[]>;

    const counts = Object.fromEntries(
      PIPELINE_STATUS_ORDER.map((status) => [status, 0]),
    ) as Record<PipelineStatus, number>;

    for (const lead of leads) {
      if (!columns[lead.pipelineStatus]) continue;
      const card = toCard(lead);
      columns[lead.pipelineStatus].push(card);
      counts[lead.pipelineStatus]++;
    }

    return { columns, counts };
  },

  async moveLead(id: string, userId: string, pipelineStatus: string, notes?: string) {
    if (!isPipelineStatus(pipelineStatus)) {
      throw new ValidationError(`Invalid pipeline status: ${pipelineStatus}`);
    }

    await getOwnedLead(id, userId);

    const data: { pipelineStatus: PipelineStatus; notes?: string } = { pipelineStatus };
    if (notes !== undefined) data.notes = notes;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.jobLead.update({ where: { id }, data });
      await tx.application.updateMany({
        where: { jobLeadId: id, userId },
        data: { status: pipelineStatus },
      });
      return updated;
    });
  },

  async updateNotes(id: string, userId: string, notes: string) {
    await getOwnedLead(id, userId);
    return prisma.jobLead.update({ where: { id }, data: { notes } });
  },
};
