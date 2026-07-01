import { convert } from 'html-to-text';
import { prisma } from '../lib/prisma';
import {
  detectTemplateVariables,
  renderTemplate,
  resolveVariables,
  type DefaultValues,
  type VariableMap,
} from '@jobhunter/shared';
import { NotFoundError } from '../utils/errors';
import { leadService, toTemplateLead } from './lead.service';
import type { EmailTemplate } from '../generated/prisma/client';

function htmlToPlainText(html: string): string {
  return convert(html, { wordwrap: 80, selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }] });
}

async function assertOwnership(id: string, userId: string): Promise<EmailTemplate> {
  const template = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!template || template.userId !== userId) throw new NotFoundError('Template', id);
  return template;
}

export const templateService = {
  htmlToPlainText,

  async list(userId: string) {
    return prisma.emailTemplate.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async getById(id: string, userId: string) {
    return assertOwnership(id, userId);
  },

  async create(
    userId: string,
    data: { name: string; subject: string; bodyHtml: string },
  ) {
    const detectedVars = detectTemplateVariables(data.subject, data.bodyHtml);
    const bodyPlainText = htmlToPlainText(data.bodyHtml);

    return prisma.emailTemplate.create({
      data: {
        userId,
        name: data.name,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyPlainText,
        detectedVars,
      },
    });
  },

  async update(
    id: string,
    userId: string,
    data: Partial<{ name: string; subject: string; bodyHtml: string }>,
  ) {
    const existing = await assertOwnership(id, userId);
    const subject = data.subject ?? existing.subject;
    const bodyHtml = data.bodyHtml ?? existing.bodyHtml;
    const detectedVars = detectTemplateVariables(subject, bodyHtml);

    return prisma.emailTemplate.update({
      where: { id },
      data: {
        ...data,
        bodyPlainText: htmlToPlainText(bodyHtml),
        detectedVars,
      },
    });
  },

  async delete(id: string, userId: string) {
    await assertOwnership(id, userId);
    return prisma.emailTemplate.delete({ where: { id } });
  },

  async updateVariableMap(id: string, userId: string, variableMap: VariableMap) {
    await assertOwnership(id, userId);
    return prisma.emailTemplate.update({
      where: { id },
      data: { variableMap: variableMap as object },
    });
  },

  async updateDefaultValues(id: string, userId: string, defaultValues: DefaultValues) {
    await assertOwnership(id, userId);
    return prisma.emailTemplate.update({
      where: { id },
      data: { defaultValues: defaultValues as object },
    });
  },

  async previewForLead(
    userId: string,
    templateId: string,
    leadId: string,
    overrides: DefaultValues = {},
  ) {
    const template = await this.getById(templateId, userId);
    const lead = await leadService.getById(leadId, userId);
    const variableMap = template.variableMap as VariableMap;
    const defaultValues = template.defaultValues as DefaultValues;

    const { context, resolved, missing } = resolveVariables(
      template.detectedVars,
      toTemplateLead(lead),
      variableMap,
      defaultValues,
      overrides,
    );

    const subject = renderTemplate(template.subject, context);
    const bodyHtml = renderTemplate(template.bodyHtml, context);
    const bodyPlainText = htmlToPlainText(bodyHtml);

    return {
      subject,
      bodyHtml,
      bodyPlainText,
      variables: resolved,
      missing,
      valid: missing.length === 0 && Boolean(lead.receiverEmail),
    };
  },

  async getAvailableSources(userId: string) {
    const leads = await prisma.jobLead.findMany({
      where: { userId },
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: { customFields: true },
    });

    const customKeys = new Set<string>();
    for (const lead of leads) {
      const fields = (lead.customFields as Record<string, unknown>) ?? {};
      Object.keys(fields).forEach((k) => customKeys.add(k));
    }

    return {
      coreFields: [
        'companyName',
        'receiverName',
        'receiverEmail',
        'jobTitle',
        'location',
        'salary',
        'linkedinUrl',
        'jobUrl',
        'jobDescription',
        'notes',
      ],
      customFields: [...customKeys].sort(),
    };
  },
};
