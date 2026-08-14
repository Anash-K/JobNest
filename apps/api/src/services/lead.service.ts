import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import {
  buildPaginationMeta,
  isLeadSource,
  LEAD_SOURCE,
  LEAD_CORE_FIELDS,
  parseListQuery,
  type LeadSource,
  type ParsedListQuery,
} from '@jobhunter/shared';
import { NotFoundError, ValidationError } from '../utils/errors';
import { buildLeadSearchWhere, prismaPagination } from '../utils/search';
import { assertCampaignOwnership } from '../utils/tenant';

import type { JobLead } from '../generated/prisma/client';
import type { TemplateLead } from '@jobhunter/shared';

export function toTemplateLead(lead: JobLead): TemplateLead {
  return {
    companyName: lead.companyName,
    receiverName: lead.receiverName,
    receiverEmail: lead.receiverEmail,
    jobTitle: lead.jobTitle,
    location: lead.location,
    salary: lead.salary,
    linkedinUrl: lead.linkedinUrl,
    jobUrl: lead.jobUrl,
    jobDescription: lead.jobDescription,
    notes: lead.notes,
    customFields: (lead.customFields as Record<string, unknown>) ?? {},
  };
}

export const leadService = {
  async list(userId: string, query: ParsedListQuery) {
    const where = { ...buildLeadSearchWhere(query), userId };
    const [items, total] = await prisma.$transaction([
      prisma.jobLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...prismaPagination(query.page, query.limit),
        include: { campaign: { select: { id: true, name: true } } },
      }),
      prisma.jobLead.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  async getById(id: string, userId: string) {
    const lead = await prisma.jobLead.findUnique({
      where: { id },
      include: { campaign: { select: { id: true, name: true } } },
    });
    if (!lead || lead.userId !== userId) throw new NotFoundError('Lead', id);

    const customFields = Object.keys(
      (lead.customFields as Record<string, unknown>) ?? {},
    );

    return {
      ...lead,
      availableFields: { coreFields: [...LEAD_CORE_FIELDS], customFields },
      templateLead: toTemplateLead(lead),
    };
  },

  async getManyByIds(ids: string[], userId: string) {
    if (ids.length === 0) return [];
    return prisma.jobLead.findMany({ where: { id: { in: ids }, userId } });
  },

  async create(
    userId: string,
    data: {
      companyName: string;
      campaignId?: string;
      receiverName?: string;
      receiverEmail?: string;
      jobTitle?: string;
      location?: string;
      salary?: string;
      linkedinUrl?: string;
      jobUrl?: string;
      jobDescription?: string;
      notes?: string;
      source?: LeadSource;
      customFields?: Record<string, unknown>;
      customFieldLabels?: Record<string, unknown>;
    },
  ) {
    if (data.campaignId) {
      await assertCampaignOwnership(data.campaignId, userId);
    }

    return prisma.jobLead.create({
      data: {
        userId,
        companyName: data.companyName,
        campaignId: data.campaignId,
        receiverName: data.receiverName,
        receiverEmail: data.receiverEmail,
        jobTitle: data.jobTitle,
        location: data.location,
        salary: data.salary,
        linkedinUrl: data.linkedinUrl,
        jobUrl: data.jobUrl,
        jobDescription: data.jobDescription,
        notes: data.notes,
        source: data.source ?? LEAD_SOURCE.MANUAL,
        customFields: (data.customFields ?? {}) as Prisma.InputJsonValue,
        customFieldLabels: (data.customFieldLabels ?? {}) as Prisma.InputJsonValue,
      },
    });
  },

  async update(
    id: string,
    userId: string,
    data: Partial<{
      companyName: string;
      campaignId: string | null;
      receiverName: string;
      receiverEmail: string;
      jobTitle: string;
      location: string;
      salary: string;
      linkedinUrl: string;
      jobUrl: string;
      jobDescription: string;
      notes: string;
      pipelineStatus: string;
      source?: LeadSource;
      customFields: Record<string, unknown>;
      customFieldLabels: Record<string, unknown>;
    }>,
  ) {
    const existing = await this.getById(id, userId);
    if (data.campaignId) {
      await assertCampaignOwnership(data.campaignId, userId);
    }
    if (data.source && !isLeadSource(data.source)) {
      throw new ValidationError(`Invalid lead source: ${data.source}`);
    }

    // Defense-in-depth: merge rather than blindly replace customFields, so a stale
    // client sending a partial object can't silently wipe untouched keys. A key is
    // only removed when the client explicitly sends it as `null` (tombstone) —
    // omitting a key entirely always means "leave it as-is".
    const merged = { ...data };
    if (data.customFields !== undefined) {
      const combined = {
        ...((existing.customFields as Record<string, unknown>) ?? {}),
        ...data.customFields,
      };
      const customFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(combined)) {
        if (value !== null) customFields[key] = value;
      }
      merged.customFields = customFields;

      // Keep labels in sync — drop labels for any key no longer present.
      const existingLabels = (existing.customFieldLabels as Record<string, unknown>) ?? {};
      const combinedLabels = { ...existingLabels, ...(data.customFieldLabels ?? {}) };
      const customFieldLabels: Record<string, unknown> = {};
      for (const key of Object.keys(customFields)) {
        if (combinedLabels[key] !== undefined && combinedLabels[key] !== null) {
          customFieldLabels[key] = combinedLabels[key];
        }
      }
      merged.customFieldLabels = customFieldLabels;
    }

    return prisma.jobLead.update({ where: { id }, data: merged as never });
  },

  async delete(id: string, userId: string) {
    await this.getById(id, userId);
    await prisma.generatedEmail.deleteMany({ where: { leadId: id, userId } });
    return prisma.jobLead.delete({ where: { id } });
  },

  async importBulk(
    userId: string,
    data: {
      campaignId?: string;
      skipDuplicates?: boolean;
      leads: Array<{
        companyName: string;
        receiverName?: string;
        receiverEmail?: string;
        jobTitle?: string;
        location?: string;
        salary?: string;
        linkedinUrl?: string;
        jobUrl?: string;
        jobDescription?: string;
        notes?: string;
        customFields?: Record<string, unknown>;
        customFieldLabels?: Record<string, unknown>;
      }>;
    },
  ) {
    if (data.leads.length === 0) {
      throw new ValidationError('At least one lead row is required for import');
    }

    if (data.campaignId) {
      await assertCampaignOwnership(data.campaignId, userId);
    }

    let leadsToImport = data.leads;
    if (data.skipDuplicates) {
      const validation = await this.validateImport(userId, {
        campaignId: data.campaignId,
        leads: data.leads,
      });
      const skipIndexes = new Set([
        ...validation.duplicatesInBatch.map((d) => d.rowIndex),
        ...validation.duplicatesExisting.map((d) => d.rowIndex),
        ...validation.invalid.map((d) => d.rowIndex),
      ]);
      leadsToImport = data.leads.filter((_, index) => !skipIndexes.has(index));
      if (leadsToImport.length === 0) {
        throw new ValidationError('No valid, non-duplicate rows to import');
      }
    }

    const rows = leadsToImport.map((lead) => ({
      userId,
      campaignId: data.campaignId,
      companyName: lead.companyName,
      receiverName: lead.receiverName,
      receiverEmail: lead.receiverEmail || null,
      jobTitle: lead.jobTitle,
      location: lead.location,
      salary: lead.salary,
      linkedinUrl: lead.linkedinUrl,
      jobUrl: lead.jobUrl,
      jobDescription: lead.jobDescription,
      notes: lead.notes,
      source: LEAD_SOURCE.EXCEL_IMPORT,
      customFields: (lead.customFields ?? {}) as Prisma.InputJsonValue,
      customFieldLabels: (lead.customFieldLabels ?? {}) as Prisma.InputJsonValue,
    }));

    const result = await prisma.jobLead.createMany({ data: rows });

    return {
      imported: result.count,
      skipped: data.leads.length - leadsToImport.length,
      source: LEAD_SOURCE.EXCEL_IMPORT,
    };
  },

  duplicateKey(lead: { companyName: string; receiverEmail?: string | null }) {
    const company = lead.companyName.trim().toLowerCase();
    const email = (lead.receiverEmail ?? '').trim().toLowerCase();
    return `${company}::${email}`;
  },

  async validateImport(
    userId: string,
    data: {
      campaignId?: string;
      leads: Array<{
        companyName: string;
        receiverName?: string;
        receiverEmail?: string;
        jobTitle?: string;
        location?: string;
        salary?: string;
        linkedinUrl?: string;
        jobUrl?: string;
        jobDescription?: string;
        notes?: string;
        customFields?: Record<string, unknown>;
        customFieldLabels?: Record<string, unknown>;
      }>;
    },
  ) {
    if (data.campaignId) {
      await assertCampaignOwnership(data.campaignId, userId);
    }

    const existingLeads = await prisma.jobLead.findMany({
      where: { userId },
      select: { id: true, companyName: true, receiverEmail: true },
    });

    const existingKeys = new Map(
      existingLeads.map((lead) => [this.duplicateKey(lead), lead.id]),
    );

    const batchKeys = new Map<string, number>();
    const valid: typeof data.leads = [];
    const invalid: Array<{ rowIndex: number; errors: string[]; row: (typeof data.leads)[0] }> =
      [];
    const duplicatesInBatch: Array<{ rowIndex: number; duplicateOfRowIndex: number }> = [];
    const duplicatesExisting: Array<{ rowIndex: number; existingLeadId: string }> = [];

    data.leads.forEach((row, rowIndex) => {
      const errors: string[] = [];

      if (!row.companyName?.trim()) {
        errors.push('Company name is required');
      }

      if (row.receiverEmail?.trim()) {
        const email = row.receiverEmail.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Invalid email address');
        }
      }

      if (errors.length > 0) {
        invalid.push({ rowIndex, errors, row });
        return;
      }

      const key = this.duplicateKey({
        companyName: row.companyName,
        receiverEmail: row.receiverEmail,
      });

      const existingId = existingKeys.get(key);
      if (existingId) {
        duplicatesExisting.push({ rowIndex, existingLeadId: existingId });
        return;
      }

      const batchDuplicate = batchKeys.get(key);
      if (batchDuplicate !== undefined) {
        duplicatesInBatch.push({ rowIndex, duplicateOfRowIndex: batchDuplicate });
        return;
      }

      batchKeys.set(key, rowIndex);
      valid.push(row);
    });

    return {
      total: data.leads.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      duplicateInBatchCount: duplicatesInBatch.length,
      duplicateExistingCount: duplicatesExisting.length,
      valid,
      invalid,
      duplicatesInBatch,
      duplicatesExisting,
    };
  },

  parseListQuery(raw: Record<string, unknown>) {
    return parseListQuery(raw);
  },
};
