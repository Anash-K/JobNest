import { apiFetch, ApiClientError, API_BASE } from './api-client';

export { ApiClientError };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  _count?: { leads: number; generatedEmails: number };
}

export interface JobLead {
  id: string;
  companyName: string;
  receiverName?: string | null;
  receiverEmail?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  salary?: string | null;
  linkedinUrl?: string | null;
  jobUrl?: string | null;
  jobDescription?: string | null;
  notes?: string | null;
  pipelineStatus: string;
  campaignId?: string | null;
  customFields?: Record<string, unknown>;
  customFieldLabels?: Record<string, string>;
  campaign?: { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImportLeadRow {
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
  customFieldLabels?: Record<string, string>;
}

export interface LeadImportValidation {
  total: number;
  validCount: number;
  invalidCount: number;
  duplicateInBatchCount: number;
  duplicateExistingCount: number;
  valid: ImportLeadRow[];
  invalid: Array<{ rowIndex: number; errors: string[]; row: ImportLeadRow }>;
  duplicatesInBatch: Array<{ rowIndex: number; duplicateOfRowIndex: number }>;
  duplicatesExisting: Array<{ rowIndex: number; existingLeadId: string }>;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  defaultDelaySeconds: number;
  defaultResumeId: string | null;
  defaultTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSessionInfo {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

export interface PipelineCard {
  id: string;
  companyName: string;
  receiverName?: string | null;
  receiverEmail?: string | null;
  jobTitle?: string | null;
  notes?: string | null;
  pipelineStatus: string;
  campaign?: { id: string; name: string } | null;
  draftCount: number;
  approvedDraftCount: number;
  createdAt: string;
}

export interface PipelineBoard {
  columns: Record<string, PipelineCard[]>;
  counts: Record<string, number>;
}

export interface EmailLog {
  id: string;
  recipientEmail: string;
  subject: string;
  status: string;
  failureReason?: string | null;
  failureMessage?: string | null;
  gmailMessageId?: string | null;
  sentAt?: string | null;
  bulkSendId?: string | null;
  createdAt: string;
  jobLead?: { id: string; companyName: string } | null;
  campaign?: { id: string; name: string } | null;
  generatedEmail?: { id: string; status: string } | null;
}

export interface Application {
  id: string;
  companyName: string;
  position?: string | null;
  receiverName?: string | null;
  receiverEmail?: string | null;
  status: string;
  appliedDate: string;
  notes?: string | null;
  campaign?: { id: string; name: string } | null;
  jobLead?: { id: string; companyName: string; pipelineStatus: string } | null;
  generatedEmail?: { id: string; status: string; subject: string } | null;
}

export interface GmailStatus {
  connected: boolean;
  email?: string | null;
  connectedAt?: string;
  valid?: boolean;
  oauthConfigured?: boolean;
}

export interface GmailOAuthConfig {
  configured: boolean;
  source: 'env' | null;
  clientId: string | null;
  redirectUri: string | null;
  hasClientSecret: boolean;
  defaultRedirectUri: string;
}

export interface BulkSendProgress {
  bulkSendId: string;
  status: 'queued' | 'running' | 'completed';
  total: number;
  sent: number;
  failed: number;
  pending: number;
  currentEmail?: string;
  currentCompany?: string;
  startedAt: string;
  completedAt?: string;
  errors: Array<{ generatedEmailId: string; message: string }>;
}

export interface Resume {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  isDefault: boolean;
  version: number;
  archived: boolean;
  originalResumeId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyPlainText?: string | null;
  detectedVars: string[];
  variableMap: Record<string, string>;
  defaultValues: Record<string, string>;
}

export interface GeneratedEmail {
  id: string;
  status: string;
  isValid: boolean;
  missingVariables: string[];
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyPlainText?: string | null;
  previewHash: string;
  buildBatchId?: string | null;
  renderedVariables: Record<string, { value: string; source: string }>;
  approvedAt?: string | null;
  createdAt: string;
  lead?: { id: string; companyName: string; receiverName?: string | null; jobTitle?: string | null };
  resume?: { id: string; name: string; fileName: string };
  campaign?: { id: string; name: string } | null;
}

export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasMore: boolean };
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export const campaignsApi = {
  list: async (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    const result = await apiFetch<Paginated<Campaign>>(`/campaigns${qs}`);
    return result.items;
  },
  create: (data: { name: string; description?: string }) =>
    apiFetch<Campaign>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Leads ───────────────────────────────────────────────────────────────────

export const leadsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<Paginated<JobLead>>(`/leads${qs}`);
  },
  get: (id: string) =>
    apiFetch<JobLead & { availableFields?: { coreFields: string[]; customFields: string[] } }>(
      `/leads/${id}`,
    ),
  create: (data: Partial<JobLead> & { companyName: string }) =>
    apiFetch<JobLead>('/leads', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<JobLead>) =>
    apiFetch<JobLead>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  validateImport: (data: { campaignId?: string; leads: ImportLeadRow[] }) =>
    apiFetch<LeadImportValidation>('/leads/import/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  import: (data: { campaignId?: string; skipDuplicates?: boolean; leads: ImportLeadRow[] }) =>
    apiFetch<{ imported: number; skipped?: number; source: string }>('/leads/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── Resumes ─────────────────────────────────────────────────────────────────

export const resumesApi = {
  list: () => apiFetch<Resume[]>('/resumes'),
  get: (id: string) => apiFetch<Resume>(`/resumes/${id}`),
  versionHistory: (id: string) => apiFetch<Resume[]>(`/resumes/${id}/version-history`),
  previewUrl: (id: string) => `${API_BASE}/resumes/${id}/preview`,
  downloadUrl: (id: string) => `${API_BASE}/resumes/${id}/download`,
  upload: async (file: File, name: string, isDefault: boolean) => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('isDefault', String(isDefault));
    const res = await fetch(`${API_BASE}/resumes`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new ApiClientError(body.error?.message ?? 'Upload failed', res.status);
    }
    return body.data as Resume;
  },
  replace: async (id: string, file: File, name?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    const res = await fetch(`${API_BASE}/resumes/${id}/replace`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new ApiClientError(body.error?.message ?? 'Replace failed', res.status);
    }
    return body.data as Resume;
  },
  setDefault: (id: string) =>
    apiFetch<Resume>(`/resumes/${id}/set-default`, { method: 'PATCH' }),
  archive: (id: string) =>
    apiFetch<Resume>(`/resumes/${id}/archive`, { method: 'PATCH' }),
  delete: (id: string) =>
    apiFetch<{ deleted: boolean; archived: boolean }>(`/resumes/${id}`, { method: 'DELETE' }),
};

// ─── Templates ───────────────────────────────────────────────────────────────

export const templatesApi = {
  list: () => apiFetch<EmailTemplate[]>('/templates'),
  get: (id: string) => apiFetch<EmailTemplate>(`/templates/${id}`),
  create: (data: { name: string; subject: string; bodyHtml: string }) =>
    apiFetch<EmailTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; subject: string; bodyHtml: string }>) =>
    apiFetch<EmailTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateVariableMap: (id: string, variableMap: Record<string, string>) =>
    apiFetch<EmailTemplate>(`/templates/${id}/variable-map`, {
      method: 'PUT',
      body: JSON.stringify(variableMap),
    }),
  updateDefaultValues: (id: string, defaultValues: Record<string, string>) =>
    apiFetch<EmailTemplate>(`/templates/${id}/default-values`, {
      method: 'PUT',
      body: JSON.stringify(defaultValues),
    }),
  getSources: () =>
    apiFetch<{ coreFields: string[]; customFields: string[] }>('/templates/sources/available'),
  preview: (data: { templateId: string; leadId: string; defaultOverrides?: Record<string, string> }) =>
    apiFetch<{
      subject: string;
      bodyHtml: string;
      bodyPlainText: string;
      variables: Record<string, { value: string; source: string }>;
      missing: string[];
      valid: boolean;
    }>('/templates/preview', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
};

// ─── Generated Emails ────────────────────────────────────────────────────────

export const generatedEmailsApi = {
  validate: (data: {
    leadIds: string[];
    templateId: string;
    resumeId?: string;
    campaignId?: string;
    defaultOverrides?: Record<string, string>;
  }) =>
    apiFetch<{
      templateId: string;
      resumeId: string;
      total: number;
      validCount: number;
      invalidCount: number;
      canBuild: boolean;
      previews: Array<{
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
      }>;
    }>('/generated-emails/validate', { method: 'POST', body: JSON.stringify(data) }),

  build: (data: {
    leadIds: string[];
    templateId: string;
    resumeId?: string;
    campaignId?: string;
    defaultOverrides?: Record<string, string>;
  }) =>
    apiFetch<{
      buildBatchId: string;
      generatedCount: number;
      validCount: number;
      invalidCount: number;
      draftIds: string[];
    }>('/generated-emails/build', { method: 'POST', body: JSON.stringify(data) }),

  list: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<Paginated<GeneratedEmail>>(`/generated-emails${qs}`);
  },

  listByBatch: (buildBatchId: string) =>
    apiFetch<GeneratedEmail[]>(`/generated-emails/batch/${buildBatchId}`),

  summary: (buildBatchId?: string) => {
    const qs = buildBatchId ? `?buildBatchId=${buildBatchId}` : '';
    return apiFetch<{
      totalGenerated: number;
      validDrafts: number;
      invalidDrafts: number;
      approvedDrafts: number;
      pendingApproval: number;
      sentDrafts: number;
      failedDrafts: number;
    }>(`/generated-emails/summary${qs}`);
  },

  get: (id: string) => apiFetch<GeneratedEmail>(`/generated-emails/${id}`),

  update: (id: string, data: { subject?: string; bodyHtml?: string }) =>
    apiFetch<GeneratedEmail>(`/generated-emails/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  approve: (id: string) =>
    apiFetch<GeneratedEmail>(`/generated-emails/${id}/approve`, { method: 'POST' }),

  unapprove: (id: string) =>
    apiFetch<GeneratedEmail>(`/generated-emails/${id}/unapprove`, { method: 'POST' }),

  bulkApprove: (data: { draftIds?: string[]; buildBatchId?: string; approveAllValidInBatch?: boolean }) =>
    apiFetch<{ approved: GeneratedEmail[]; count: number }>('/generated-emails/bulk-approve', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/generated-emails/${id}`, { method: 'DELETE' }),
};

// ─── Pipeline ────────────────────────────────────────────────────────────────

export const pipelineApi = {
  getBoard: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<PipelineBoard>(`/pipeline${qs}`);
  },
  moveLead: (id: string, data: { pipelineStatus: string; notes?: string }) =>
    apiFetch<JobLead>(`/pipeline/leads/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  updateNotes: (id: string, notes: string) =>
    apiFetch<JobLead>(`/pipeline/leads/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),
};

// ─── Gmail ───────────────────────────────────────────────────────────────────

export const gmailApi = {
  getOAuthConfig: () => apiFetch<GmailOAuthConfig>('/gmail/oauth-config'),
  getAuthUrl: () => apiFetch<{ url: string }>('/gmail/auth-url'),
  getStatus: () => apiFetch<GmailStatus>('/gmail/status'),
  verify: () => apiFetch<GmailStatus & { valid?: boolean }>('/gmail/verify', { method: 'POST' }),
  disconnect: () => apiFetch<{ disconnected: boolean }>('/gmail/disconnect', { method: 'DELETE' }),
};

// ─── Bulk Send ───────────────────────────────────────────────────────────────

export const bulkSendApi = {
  validate: (data: {
    generatedEmailIds?: string[];
    buildBatchId?: string;
    sendAllApproved?: boolean;
  }) =>
    apiFetch<{
      valid: boolean;
      count: number;
      delaySeconds: number;
      estimatedMinutes: number;
      gmailConnected: boolean;
      gmailEmail?: string | null;
      dailySentCount: number;
      dailyWarning: boolean;
      dailyThreshold: number;
    }>('/bulk-send/validate', { method: 'POST', body: JSON.stringify(data) }),

  start: (data: {
    generatedEmailIds?: string[];
    buildBatchId?: string;
    sendAllApproved?: boolean;
    delaySeconds?: number;
  }) =>
    apiFetch<{ bulkSendId: string; count: number; estimatedMinutes: number }>('/bulk-send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStatus: (bulkSendId: string) =>
    apiFetch<BulkSendProgress>(`/bulk-send/${bulkSendId}/status`),

  retryFailed: (bulkSendId: string) =>
    apiFetch<{ bulkSendId: string; count: number; retriedFrom?: string }>(
      `/bulk-send/${bulkSendId}/retry-failed`,
      { method: 'POST' },
    ),
};

// ─── Email Logs ──────────────────────────────────────────────────────────────

export const emailLogsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<Paginated<EmailLog>>(`/email-logs${qs}`);
  },
  listFailed: () => apiFetch<EmailLog[]>('/email-logs/failed'),
  get: (id: string) => apiFetch<EmailLog>(`/email-logs/${id}`),
};

// ─── Applications ────────────────────────────────────────────────────────────

export const applicationsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<Paginated<Application>>(`/applications${qs}`);
  },
  get: (id: string) => apiFetch<Application>(`/applications/${id}`),
};

// ─── Users / Settings ────────────────────────────────────────────────────────

export const usersApi = {
  getProfile: () => apiFetch<UserProfile>('/users/me'),
  updateProfile: (data: {
    name?: string;
    image?: string | null;
    defaultDelaySeconds?: number;
    defaultResumeId?: string | null;
    defaultTemplateId?: string | null;
  }) =>
    apiFetch<UserProfile>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  listSessions: () => apiFetch<UserSessionInfo[]>('/users/me/sessions'),
  revokeSession: (sessionId: string) =>
    apiFetch<{ revoked: boolean; wasCurrent: boolean }>(`/users/me/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  revokeOtherSessions: () =>
    apiFetch<{ revokedCount: number }>('/users/me/sessions/others', { method: 'DELETE' }),
};

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalCampaigns: number;
  totalTemplates: number;
  totalResumes: number;
  totalLeads: number;
  readyToApply: number;
  totalApplications: number;
  applicationsSent: number;
  failedEmails: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  totalDrafts: number;
  generatedDrafts: number;
  approvedDrafts: number;
  pendingApproval: number;
  sentDrafts: number;
  failedDrafts: number;
}

export interface DraftFunnel {
  generated: number;
  draft: number;
  approved: number;
  sent: number;
  failed: number;
  conversionRates: {
    generatedToApproved: number;
    approvedToSent: number;
    sentSuccessRate: number;
  };
}

function analyticsQs(campaignId?: string, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra);
  if (campaignId) params.set('campaignId', campaignId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface RecentActivity {
  id: string;
  type: 'application' | 'email_sent' | 'email_failed' | 'lead_created';
  title: string;
  subtitle: string | null;
  status: string;
  occurredAt: string;
  campaignName: string | null;
}

export const analyticsApi = {
  summary: (campaignId?: string) =>
    apiFetch<AnalyticsSummary>(`/analytics/summary${analyticsQs(campaignId)}`),

  draftFunnel: (campaignId?: string) =>
    apiFetch<DraftFunnel>(`/analytics/draft-funnel${analyticsQs(campaignId)}`),

  applicationsByMonth: (campaignId?: string) =>
    apiFetch<Array<{ month: string; count: number }>>(
      `/analytics/applications-by-month${analyticsQs(campaignId)}`,
    ),

  applicationsByCampaign: () =>
    apiFetch<Array<{ campaignId: string; campaignName: string; count: number }>>(
      '/analytics/applications-by-campaign',
    ),

  pipelineDistribution: (campaignId?: string) =>
    apiFetch<Array<{ status: string; count: number }>>(
      `/analytics/pipeline-distribution${analyticsQs(campaignId)}`,
    ),

  recentApplications: (campaignId?: string, limit = 10) =>
    apiFetch<Application[]>(
      `/analytics/recent-applications${analyticsQs(campaignId, { limit: String(limit) })}`,
    ),

  failedEmails: (campaignId?: string, limit = 10) =>
    apiFetch<EmailLog[]>(
      `/analytics/failed-emails${analyticsQs(campaignId, { limit: String(limit) })}`,
    ),

  recentActivity: (opts?: { campaignId?: string; limit?: number; search?: string }) =>
    apiFetch<RecentActivity[]>(
      `/analytics/recent-activity${analyticsQs(opts?.campaignId, {
        ...(opts?.limit ? { limit: String(opts.limit) } : {}),
        ...(opts?.search ? { search: opts.search } : {}),
      })}`,
    ),
};
