import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  computePreviewHash,
  renderTemplate,
  resolveVariables,
  validateLeadVariables,
  type DefaultValues,
  type VariableMap,
} from '@jobhunter/shared';
import { ValidationError } from '../utils/errors';
import { assertCampaignOwnership } from '../utils/tenant';
import { leadService, toTemplateLead } from './lead.service';
import { resumeService } from './resume.service';
import { templateService } from './template.service';
import type { JobLead } from '../generated/prisma/client';

export interface BuildEmailsInput {
  userId: string;
  leadIds: string[];
  templateId: string;
  resumeId?: string;
  campaignId?: string;
  defaultOverrides?: DefaultValues;
}

export interface DraftRowInput {
  userId: string;
  campaignId: string | null;
  leadId: string;
  templateId: string;
  resumeId: string;
  buildBatchId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyPlainText: string;
  previewHash: string;
  isValid: boolean;
  missingVariables: string[];
  renderedVariables: object;
}

export interface LeadBuildPreview {
  leadId: string;
  companyName: string;
  receiverName: string | null;
  recipientEmail: string;
  isValid: boolean;
  missingVariables: string[];
  subject: string;
  bodyHtml: string;
  bodyPlainText: string;
  renderedVariables: Record<string, { value: string; source: string }>;
}

async function loadBuildContext(input: BuildEmailsInput) {
  const leadIds = [...new Set(input.leadIds)];

  if (leadIds.length === 0) {
    throw new ValidationError('At least one lead is required');
  }

  if (input.campaignId) {
    await assertCampaignOwnership(input.campaignId, input.userId);
  }

  const [template, resume, leads] = await Promise.all([
    templateService.getById(input.templateId, input.userId),
    resumeService.resolveResumeId(input.userId, input.resumeId),
    leadService.getManyByIds(leadIds, input.userId),
  ]);

  if (leads.length !== leadIds.length) {
    throw new ValidationError('One or more lead IDs were not found');
  }

  if (input.campaignId) {
    const outsideCampaign = leads.filter((l) => l.campaignId !== input.campaignId);
    if (outsideCampaign.length > 0) {
      throw new ValidationError('All selected leads must belong to the chosen campaign');
    }
  }

  return { template, resume, leads };
}

function buildDraftRow(
  input: BuildEmailsInput,
  template: Awaited<ReturnType<typeof templateService.getById>>,
  resume: { id: string },
  lead: JobLead,
  buildBatchId: string,
): DraftRowInput {
  const variableMap = template.variableMap as VariableMap;
  const defaultValues = template.defaultValues as DefaultValues;
  const overrides = input.defaultOverrides ?? {};

  const templateLead = toTemplateLead(lead);
  const validation = validateLeadVariables(
    template.detectedVars,
    templateLead,
    variableMap,
    defaultValues,
    overrides,
  );

  const { context, resolved } = resolveVariables(
    template.detectedVars,
    templateLead,
    variableMap,
    defaultValues,
    overrides,
  );

  const subject = renderTemplate(template.subject, context);
  const bodyHtml = renderTemplate(template.bodyHtml, context);
  const bodyPlainText = templateService.htmlToPlainText(bodyHtml);
  const recipientEmail = lead.receiverEmail ?? '';

  return {
    userId: input.userId,
    campaignId: input.campaignId ?? lead.campaignId,
    leadId: lead.id,
    templateId: template.id,
    resumeId: resume.id,
    buildBatchId,
    recipientEmail,
    subject,
    bodyHtml,
    bodyPlainText,
    previewHash: computePreviewHash(subject, bodyHtml, recipientEmail),
    isValid: validation.valid,
    missingVariables: validation.missing,
    renderedVariables: resolved as object,
  };
}

export const emailBuildService = {
  async validate(input: BuildEmailsInput) {
    const { template, resume, leads } = await loadBuildContext(input);
    const buildBatchId = randomUUID();

    const previews: LeadBuildPreview[] = leads.map((lead) => {
      const row = buildDraftRow(input, template, resume, lead, buildBatchId);
      return {
        leadId: lead.id,
        companyName: lead.companyName,
        receiverName: lead.receiverName,
        recipientEmail: row.recipientEmail,
        isValid: row.isValid,
        missingVariables: row.missingVariables,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        bodyPlainText: row.bodyPlainText,
        renderedVariables: row.renderedVariables as Record<string, { value: string; source: string }>,
      };
    });

    const validCount = previews.filter((p) => p.isValid).length;

    return {
      templateId: template.id,
      resumeId: resume.id,
      total: previews.length,
      validCount,
      invalidCount: previews.length - validCount,
      canBuild: previews.length > 0,
      previews,
    };
  },

  async build(input: BuildEmailsInput) {
    const { template, resume, leads } = await loadBuildContext(input);
    const buildBatchId = randomUUID();

    const draftRows = leads.map((lead) =>
      buildDraftRow(input, template, resume, lead, buildBatchId),
    );

    await prisma.$transaction(async (tx) => {
      await tx.generatedEmail.createMany({ data: draftRows });
    });

    const created = await prisma.generatedEmail.findMany({
      where: { userId: input.userId, buildBatchId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, isValid: true },
    });

    const validCount = created.filter((d) => d.isValid).length;

    return {
      buildBatchId,
      generatedCount: created.length,
      validCount,
      invalidCount: created.length - validCount,
      draftIds: created.map((d) => d.id),
    };
  },

  async rebuild(buildBatchId: string, input: BuildEmailsInput) {
    await prisma.generatedEmail.deleteMany({
      where: { buildBatchId, userId: input.userId, status: 'DRAFT' },
    });
    return this.build(input);
  },
};
