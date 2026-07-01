import { prisma } from '../lib/prisma';
import { PIPELINE_STATUS_ORDER } from '@jobhunter/shared';
import { assertCampaignOwnership } from '../utils/tenant';
import type { Prisma } from '../generated/prisma/client';

export type ActivityType = 'application' | 'email_sent' | 'email_failed' | 'lead_created';

export interface RecentActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string | null;
  status: string;
  occurredAt: string;
  campaignName: string | null;
}

function leadFilter(userId: string, campaignId?: string): Prisma.JobLeadWhereInput {
  return { userId, ...(campaignId ? { campaignId } : {}) };
}

function emailFilter(userId: string, campaignId?: string): Prisma.EmailLogWhereInput {
  return { userId, ...(campaignId ? { campaignId } : {}) };
}

function draftFilter(userId: string, campaignId?: string): Prisma.GeneratedEmailWhereInput {
  return { userId, ...(campaignId ? { campaignId } : {}) };
}

function applicationFilter(userId: string, campaignId?: string): Prisma.ApplicationWhereInput {
  return { userId, ...(campaignId ? { campaignId } : {}) };
}

function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

async function assertCampaignScope(userId: string, campaignId?: string): Promise<void> {
  if (campaignId) {
    await assertCampaignOwnership(campaignId, userId);
  }
}

export const analyticsService = {
  parseCampaignId(raw: Record<string, unknown>) {
    return typeof raw.campaignId === 'string' ? raw.campaignId : undefined;
  },

  parseSearch(raw: Record<string, unknown>) {
    return typeof raw.search === 'string' && raw.search.trim() ? raw.search.trim() : undefined;
  },

  async getSummary(userId: string, campaignId?: string) {
    await assertCampaignScope(userId, campaignId);

    const leadWhere = leadFilter(userId, campaignId);
    const emailWhere = emailFilter(userId, campaignId);
    const draftWhere = draftFilter(userId, campaignId);
    const appWhere = applicationFilter(userId, campaignId);

    const [
      totalCampaigns,
      totalTemplates,
      totalResumes,
      totalLeads,
      readyToApply,
      totalApplications,
      applicationsSent,
      failedEmails,
      replies,
      interviews,
      offers,
      rejections,
      totalDrafts,
      generatedDrafts,
      approvedDrafts,
      pendingApproval,
      sentDrafts,
      failedDrafts,
    ] = await prisma.$transaction([
      prisma.campaign.count({ where: { userId } }),
      prisma.emailTemplate.count({ where: { userId } }),
      prisma.resume.count({ where: { userId, archived: false } }),
      prisma.jobLead.count({ where: leadWhere }),
      prisma.jobLead.count({ where: { ...leadWhere, pipelineStatus: 'READY_TO_APPLY' } }),
      prisma.application.count({ where: appWhere }),
      prisma.emailLog.count({ where: { ...emailWhere, status: 'SENT' } }),
      prisma.emailLog.count({ where: { ...emailWhere, status: 'FAILED' } }),
      prisma.jobLead.count({ where: { ...leadWhere, pipelineStatus: 'REPLIED' } }),
      prisma.jobLead.count({ where: { ...leadWhere, pipelineStatus: 'INTERVIEW' } }),
      prisma.jobLead.count({ where: { ...leadWhere, pipelineStatus: 'OFFER' } }),
      prisma.jobLead.count({ where: { ...leadWhere, pipelineStatus: 'REJECTED' } }),
      prisma.generatedEmail.count({ where: draftWhere }),
      prisma.generatedEmail.count({ where: { ...draftWhere, status: 'DRAFT' } }),
      prisma.generatedEmail.count({ where: { ...draftWhere, status: 'APPROVED' } }),
      prisma.generatedEmail.count({
        where: { ...draftWhere, status: 'DRAFT', isValid: true },
      }),
      prisma.generatedEmail.count({ where: { ...draftWhere, status: 'SENT' } }),
      prisma.generatedEmail.count({ where: { ...draftWhere, status: 'FAILED' } }),
    ]);

    return {
      totalCampaigns,
      totalTemplates,
      totalResumes,
      totalLeads,
      readyToApply,
      totalApplications,
      applicationsSent,
      failedEmails,
      replies,
      interviews,
      offers,
      rejections,
      totalDrafts,
      generatedDrafts,
      approvedDrafts,
      pendingApproval,
      sentDrafts,
      failedDrafts,
    };
  },

  async getDraftFunnel(userId: string, campaignId?: string) {
    await assertCampaignScope(userId, campaignId);
    const where = draftFilter(userId, campaignId);

    const [draft, approved, sent, failed] = await prisma.$transaction([
      prisma.generatedEmail.count({ where: { ...where, status: 'DRAFT' } }),
      prisma.generatedEmail.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.generatedEmail.count({ where: { ...where, status: 'SENT' } }),
      prisma.generatedEmail.count({ where: { ...where, status: 'FAILED' } }),
    ]);

    const generated = draft + approved + sent + failed;
    const approvedTotal = approved + sent;
    const sentTotal = sent;

    return {
      generated,
      draft,
      approved: approvedTotal,
      sent: sentTotal,
      failed,
      conversionRates: {
        generatedToApproved: rate(approvedTotal, generated),
        approvedToSent: rate(sentTotal, approvedTotal),
        sentSuccessRate: rate(sentTotal, sentTotal + failed),
      },
    };
  },

  async getApplicationsByMonth(userId: string, campaignId?: string) {
    await assertCampaignScope(userId, campaignId);
    const where = applicationFilter(userId, campaignId);

    const apps = await prisma.application.findMany({
      where,
      select: { appliedDate: true },
      orderBy: { appliedDate: 'asc' },
    });

    const byMonth = new Map<string, number>();
    for (const app of apps) {
      const d = app.appliedDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  },

  async getApplicationsByCampaign(userId: string) {
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        _count: { select: { applications: true } },
      },
      orderBy: { name: 'asc' },
    });

    return campaigns.map((c) => ({
      campaignId: c.id,
      campaignName: c.name,
      count: c._count.applications,
    }));
  },

  async getPipelineDistribution(userId: string, campaignId?: string) {
    await assertCampaignScope(userId, campaignId);
    const where = leadFilter(userId, campaignId);

    const groups = await prisma.jobLead.groupBy({
      by: ['pipelineStatus'],
      where,
      _count: { id: true },
    });

    const countMap = Object.fromEntries(
      groups.map((g) => [g.pipelineStatus, g._count.id]),
    ) as Record<string, number>;

    return PIPELINE_STATUS_ORDER.map((status) => ({
      status,
      count: countMap[status] ?? 0,
    }));
  },

  async getRecentApplications(userId: string, campaignId?: string, limit = 10) {
    await assertCampaignScope(userId, campaignId);
    const where = applicationFilter(userId, campaignId);

    return prisma.application.findMany({
      where,
      orderBy: { appliedDate: 'desc' },
      take: limit,
      include: {
        campaign: { select: { id: true, name: true } },
        jobLead: { select: { id: true, companyName: true } },
      },
    });
  },

  async getFailedEmails(userId: string, campaignId?: string, limit = 10) {
    await assertCampaignScope(userId, campaignId);

    return prisma.emailLog.findMany({
      where: {
        userId,
        status: 'FAILED',
        ...(campaignId ? { campaignId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        jobLead: { select: { id: true, companyName: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  },

  async getRecentActivity(
    userId: string,
    options: { campaignId?: string; limit?: number; search?: string } = {},
  ): Promise<RecentActivityItem[]> {
    const { campaignId, limit = 20, search } = options;
    await assertCampaignScope(userId, campaignId);

    const perSource = Math.ceil(limit / 4);
    const searchFilter = search?.toLowerCase();

    const [applications, sentLogs, failedLogs, leads] = await Promise.all([
      prisma.application.findMany({
        where: applicationFilter(userId, campaignId),
        orderBy: { appliedDate: 'desc' },
        take: perSource,
        include: {
          campaign: { select: { name: true } },
          jobLead: { select: { companyName: true } },
        },
      }),
      prisma.emailLog.findMany({
        where: { ...emailFilter(userId, campaignId), status: 'SENT' },
        orderBy: { sentAt: 'desc' },
        take: perSource,
        include: {
          campaign: { select: { name: true } },
          jobLead: { select: { companyName: true } },
        },
      }),
      prisma.emailLog.findMany({
        where: { ...emailFilter(userId, campaignId), status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: perSource,
        include: {
          campaign: { select: { name: true } },
          jobLead: { select: { companyName: true } },
        },
      }),
      prisma.jobLead.findMany({
        where: leadFilter(userId, campaignId),
        orderBy: { createdAt: 'desc' },
        take: perSource,
        include: { campaign: { select: { name: true } } },
      }),
    ]);

    const items: RecentActivityItem[] = [
      ...applications.map((a) => ({
        id: `app-${a.id}`,
        type: 'application' as const,
        title: a.jobLead?.companyName ?? 'Application',
        subtitle: a.notes,
        status: a.status,
        occurredAt: a.appliedDate.toISOString(),
        campaignName: a.campaign?.name ?? null,
      })),
      ...sentLogs.map((l) => ({
        id: `sent-${l.id}`,
        type: 'email_sent' as const,
        title: l.jobLead?.companyName ?? l.recipientEmail,
        subtitle: l.subject,
        status: 'SENT',
        occurredAt: (l.sentAt ?? l.createdAt).toISOString(),
        campaignName: l.campaign?.name ?? null,
      })),
      ...failedLogs.map((l) => ({
        id: `failed-${l.id}`,
        type: 'email_failed' as const,
        title: l.jobLead?.companyName ?? l.recipientEmail,
        subtitle: l.failureMessage ?? l.subject,
        status: 'FAILED',
        occurredAt: l.createdAt.toISOString(),
        campaignName: l.campaign?.name ?? null,
      })),
      ...leads.map((l) => ({
        id: `lead-${l.id}`,
        type: 'lead_created' as const,
        title: l.companyName,
        subtitle: l.jobTitle,
        status: l.pipelineStatus,
        occurredAt: l.createdAt.toISOString(),
        campaignName: l.campaign?.name ?? null,
      })),
    ];

    const filtered = searchFilter
      ? items.filter(
          (item) =>
            item.title.toLowerCase().includes(searchFilter) ||
            (item.subtitle?.toLowerCase().includes(searchFilter) ?? false) ||
            (item.campaignName?.toLowerCase().includes(searchFilter) ?? false),
        )
      : items;

    return filtered
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  },
};
