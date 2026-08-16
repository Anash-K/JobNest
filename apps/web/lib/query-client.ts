import { QueryClient } from '@tanstack/react-query';

export const STALE_TIME = {
  short: 30_000,
  medium: 60_000,
  long: 5 * 60_000,
} as const;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME.medium,
        gcTime: 10 * 60_000,
        retry: (failureCount, error) => {
          if (error && typeof error === 'object' && 'statusCode' in error) {
            const status = (error as { statusCode: number }).statusCode;
            if (status === 401 || status === 403 || status === 404) return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryKeys = {
  health: ['health'] as const,
  profile: ['profile'] as const,
  sessions: ['sessions'] as const,
  campaigns: (params?: Record<string, string>) => ['campaigns', params] as const,
  leads: (params?: Record<string, string>) => ['leads', params] as const,
  leadImportValidation: (hash: string) => ['leads', 'import-validate', hash] as const,
  resumes: ['resumes'] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  templateSources: ['templates', 'sources'] as const,
  generatedEmails: (params?: Record<string, string>) => ['generated-emails', params] as const,
  generatedEmailBatch: (batchId: string) => ['generated-emails', 'batch', batchId] as const,
  pipeline: (params?: Record<string, string>) => ['pipeline', params] as const,
  applications: (params?: Record<string, string>) => ['applications', params] as const,
  emailLogs: (params?: Record<string, string>) => ['email-logs', params] as const,
  replies: (params?: Record<string, string>) => ['replies', params] as const,
  reply: (id: string) => ['replies', id] as const,
  repliesUnreadCount: ['replies', 'unread-count'] as const,
  gmailStatus: ['gmail', 'status'] as const,
  gmailOAuthConfig: ['gmail', 'oauth-config'] as const,
  analytics: {
    summary: (campaignId?: string) => ['analytics', 'summary', campaignId] as const,
    draftFunnel: (campaignId?: string) => ['analytics', 'draft-funnel', campaignId] as const,
    applicationsByMonth: (campaignId?: string) => ['analytics', 'by-month', campaignId] as const,
    applicationsByCampaign: () => ['analytics', 'by-campaign'] as const,
    pipelineDistribution: (campaignId?: string) => ['analytics', 'pipeline', campaignId] as const,
    recentApplications: (campaignId?: string) => ['analytics', 'recent-apps', campaignId] as const,
    failedEmails: (campaignId?: string) => ['analytics', 'failed-emails', campaignId] as const,
    recentActivity: (opts?: { campaignId?: string; search?: string }) =>
      ['analytics', 'recent-activity', opts] as const,
  },
  bulkSendStatus: (bulkSendId: string) => ['bulk-send', bulkSendId] as const,
};
