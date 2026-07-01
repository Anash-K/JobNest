import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { gmailService } from './gmail.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { EmailFailureReason, GeneratedEmail } from '../generated/prisma/client';

export interface BulkSendProgress {
  bulkSendId: string;
  userId: string;
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

export interface BulkSendValidation {
  valid: boolean;
  count: number;
  delaySeconds: number;
  estimatedMinutes: number;
  gmailConnected: boolean;
  gmailEmail?: string | null;
  dailySentCount: number;
  dailyWarning: boolean;
  dailyThreshold: number;
}

const jobs = new Map<string, BulkSendProgress>();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(baseSeconds: number): number {
  const base = baseSeconds * 1000;
  return base + Math.floor(Math.random() * 5000);
}

function retryBackoffMs(attempt: number, reason: EmailFailureReason): number {
  if (reason === 'GMAIL_LIMIT') return 60_000;
  return 2000 * (attempt + 1);
}

function extractErrorCode(err: unknown): string | undefined {
  if (
    err instanceof ValidationError &&
    err.details &&
    typeof err.details === 'object' &&
    'code' in (err.details as object)
  ) {
    return (err.details as { code?: string }).code;
  }
  return undefined;
}

function mapFailureReason(err: unknown): EmailFailureReason {
  const code = extractErrorCode(err);
  if (code === 'GMAIL_LIMIT') return 'GMAIL_LIMIT';
  if (code === 'GMAIL_NOT_CONNECTED') return 'GMAIL_NOT_CONNECTED';
  if (code === 'NETWORK_ERROR') return 'NETWORK_ERROR';

  if (err instanceof ValidationError) {
    if (err.message.includes('rate limit')) return 'GMAIL_LIMIT';
    if (err.message.includes('not connected')) return 'GMAIL_NOT_CONNECTED';
    if (err.message.includes('resume')) return 'ATTACHMENT_ERROR';
    if (err.message.includes('Invalid email') || err.message.includes('recipient')) {
      return 'INVALID_EMAIL';
    }
    if (err.message.includes('not approved') || err.message.includes('invalid')) {
      return 'DRAFT_NOT_APPROVED';
    }
  }

  return 'NETWORK_ERROR';
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function countSentToday(userId: string): Promise<number> {
  return prisma.emailLog.count({
    where: {
      userId,
      status: 'SENT',
      sentAt: { gte: startOfToday() },
    },
  });
}

async function resolveDraftIds(
  userId: string,
  input: {
    generatedEmailIds?: string[];
    buildBatchId?: string;
    sendAllApproved?: boolean;
  },
): Promise<string[]> {
  if (input.generatedEmailIds?.length) {
    return input.generatedEmailIds;
  }

  if (input.sendAllApproved && input.buildBatchId) {
    const drafts = await prisma.generatedEmail.findMany({
      where: {
        userId,
        buildBatchId: input.buildBatchId,
        status: 'APPROVED',
        isValid: true,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return drafts.map((d) => d.id);
  }

  throw new ValidationError('Provide generatedEmailIds or buildBatchId with sendAllApproved');
}

function assertRecipientEmail(email: string): void {
  if (!EMAIL_REGEX.test(email.trim())) {
    throw new ValidationError(`Invalid recipient email: ${email}`, { code: 'INVALID_EMAIL' });
  }
}

async function upsertSendingLog(
  userId: string,
  bulkSendId: string,
  draft: GeneratedEmail,
) {
  const existing = await prisma.emailLog.findUnique({
    where: { generatedEmailId: draft.id },
  });

  if (existing) {
    return prisma.emailLog.update({
      where: { id: existing.id },
      data: {
        status: 'SENDING',
        bulkSendId,
        failureReason: null,
        failureMessage: null,
        recipientEmail: draft.recipientEmail,
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        bodyPlainText: draft.bodyPlainText,
      },
    });
  }

  return prisma.emailLog.create({
    data: {
      userId,
      campaignId: draft.campaignId,
      jobLeadId: draft.leadId,
      templateId: draft.templateId,
      resumeId: draft.resumeId,
      generatedEmailId: draft.id,
      recipientEmail: draft.recipientEmail,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      bodyPlainText: draft.bodyPlainText,
      status: 'SENDING',
      bulkSendId,
    },
  });
}

async function recordSendSuccess(
  userId: string,
  draft: GeneratedEmail,
  emailLogId: string,
  gmailMessageId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.emailLog.update({
      where: { id: emailLogId },
      data: { status: 'SENT', gmailMessageId, sentAt: new Date() },
    }),
    prisma.generatedEmail.update({
      where: { id: draft.id },
      data: { status: 'SENT', sentAt: new Date() },
    }),
    prisma.jobLead.update({
      where: { id: draft.leadId },
      data: { pipelineStatus: 'APPLIED' },
    }),
    prisma.application.upsert({
      where: { generatedEmailId: draft.id },
      create: {
        userId,
        campaignId: draft.campaignId,
        jobLeadId: draft.leadId,
        resumeId: draft.resumeId,
        templateId: draft.templateId,
        generatedEmailId: draft.id,
        status: 'APPLIED',
        appliedDate: new Date(),
      },
      update: {
        status: 'APPLIED',
        appliedDate: new Date(),
      },
    }),
  ]);
}

async function recordSendFailure(
  draftId: string,
  emailLogId: string,
  reason: EmailFailureReason,
  message: string,
  attemptsUsed: number,
): Promise<void> {
  await prisma.$transaction([
    prisma.emailLog.update({
      where: { id: emailLogId },
      data: {
        status: 'FAILED',
        failureReason: reason,
        failureMessage: message,
        retryCount: attemptsUsed,
      },
    }),
    prisma.generatedEmail.update({
      where: { id: draftId },
      data: { status: 'FAILED' },
    }),
  ]);
}

async function reconstructJobFromLogs(
  userId: string,
  bulkSendId: string,
): Promise<BulkSendProgress | null> {
  const logs = await prisma.emailLog.findMany({
    where: { userId, bulkSendId },
    select: {
      status: true,
      generatedEmailId: true,
      failureMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (logs.length === 0) return null;

  const sent = logs.filter((l) => l.status === 'SENT').length;
  const failed = logs.filter((l) => l.status === 'FAILED').length;
  const inFlight = logs.filter((l) => l.status === 'SENDING' || l.status === 'PENDING').length;
  const errors = logs
    .filter((l) => l.status === 'FAILED' && l.generatedEmailId)
    .map((l) => ({
      generatedEmailId: l.generatedEmailId!,
      message: l.failureMessage ?? 'Send failed',
    }));

  return {
    bulkSendId,
    userId,
    status: inFlight > 0 ? 'running' : 'completed',
    total: logs.length,
    sent,
    failed,
    pending: inFlight,
    startedAt: logs[0]!.createdAt.toISOString(),
    completedAt: inFlight > 0 ? undefined : new Date().toISOString(),
    errors,
  };
}

export const bulkSendService = {
  getJob(userId: string, bulkSendId: string): BulkSendProgress | null {
    const job = jobs.get(bulkSendId);
    if (!job || job.userId !== userId) return null;
    return job;
  },

  async getJobStatus(userId: string, bulkSendId: string): Promise<BulkSendProgress | null> {
    const active = this.getJob(userId, bulkSendId);
    if (active) return active;
    return reconstructJobFromLogs(userId, bulkSendId);
  },

  async validate(
    userId: string,
    input: {
      generatedEmailIds?: string[];
      buildBatchId?: string;
      sendAllApproved?: boolean;
    },
  ): Promise<BulkSendValidation> {
    const ids = await resolveDraftIds(userId, input);
    if (ids.length === 0) throw new ValidationError('No drafts selected');

    const drafts = await prisma.generatedEmail.findMany({
      where: { id: { in: ids }, userId },
      include: { lead: { select: { companyName: true } } },
    });

    const missing = ids.filter((id) => !drafts.find((d) => d.id === id));
    const invalid = drafts.filter((d) => d.status !== 'APPROVED' || !d.isValid);

    if (missing.length > 0 || invalid.length > 0) {
      throw new ValidationError('Some drafts cannot be sent', {
        missing,
        invalid: invalid.map((d) => ({
          id: d.id,
          status: d.status,
          isValid: d.isValid,
          company: d.lead?.companyName,
        })),
      });
    }

    const gmail = await gmailService.getStatus(userId);
    if (!gmail.connected) {
      throw new ValidationError('Gmail is not connected', { code: 'GMAIL_NOT_CONNECTED' });
    }

    const delaySeconds = env.BULK_SEND_DELAY_SECONDS;
    const estimatedSeconds = ids.length * delaySeconds;
    const dailySentCount = await countSentToday(userId);
    const projectedTotal = dailySentCount + ids.length;

    return {
      valid: true,
      count: ids.length,
      delaySeconds,
      estimatedMinutes: Math.ceil(estimatedSeconds / 60),
      gmailConnected: true,
      gmailEmail: gmail.email,
      dailySentCount,
      dailyWarning: projectedTotal > env.BULK_SEND_DAILY_WARN_THRESHOLD,
      dailyThreshold: env.BULK_SEND_DAILY_WARN_THRESHOLD,
    };
  },

  async start(
    userId: string,
    input: {
      generatedEmailIds?: string[];
      buildBatchId?: string;
      sendAllApproved?: boolean;
      delaySeconds?: number;
    },
  ) {
    const validation = await this.validate(userId, input);
    const ids = await resolveDraftIds(userId, input);
    const bulkSendId = randomUUID();
    const delaySeconds = input.delaySeconds ?? env.BULK_SEND_DELAY_SECONDS;

    const progress: BulkSendProgress = {
      bulkSendId,
      userId,
      status: 'queued',
      total: validation.count,
      sent: 0,
      failed: 0,
      pending: validation.count,
      startedAt: new Date().toISOString(),
      errors: [],
    };
    jobs.set(bulkSendId, progress);

    void this.processQueue(userId, bulkSendId, ids, delaySeconds).catch((err) => {
      console.error('[bulk-send] queue failed', bulkSendId, err);
      const job = jobs.get(bulkSendId);
      if (job && job.status !== 'completed') {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
      }
    });

    return { bulkSendId, ...validation };
  },

  async processQueue(
    userId: string,
    bulkSendId: string,
    draftIds: string[],
    delaySeconds: number,
  ): Promise<void> {
    const progress = jobs.get(bulkSendId);
    if (!progress) return;

    progress.status = 'running';

    try {
      for (let i = 0; i < draftIds.length; i++) {
        const draftId = draftIds[i]!;

        try {
          await this.sendOneDraft(userId, bulkSendId, draftId, progress);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unexpected send error';
          console.error('[bulk-send] unhandled error', draftId, err);
          progress.failed++;
          progress.pending = Math.max(0, progress.pending - 1);
          progress.errors.push({ generatedEmailId: draftId, message });
        }

        progress.currentEmail = undefined;
        progress.currentCompany = undefined;

        if (i < draftIds.length - 1) {
          await sleep(jitterMs(delaySeconds));
        }
      }
    } finally {
      progress.status = 'completed';
      progress.completedAt = new Date().toISOString();
      progress.currentEmail = undefined;
      progress.currentCompany = undefined;
    }
  },

  async sendOneDraft(
    userId: string,
    bulkSendId: string,
    draftId: string,
    progress: BulkSendProgress,
  ): Promise<void> {
    const draft = await prisma.generatedEmail.findUnique({
      where: { id: draftId },
      include: { lead: { select: { companyName: true } } },
    });

    if (!draft || draft.userId !== userId) {
      progress.failed++;
      progress.pending--;
      progress.errors.push({ generatedEmailId: draftId, message: 'Draft not found' });
      return;
    }

    if (draft.status !== 'APPROVED' || !draft.isValid) {
      progress.failed++;
      progress.pending--;
      progress.errors.push({
        generatedEmailId: draftId,
        message: 'Draft not approved or invalid',
      });
      return;
    }

    progress.currentEmail = draft.recipientEmail;
    progress.currentCompany = draft.lead?.companyName;

    try {
      assertRecipientEmail(draft.recipientEmail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid email';
      const emailLog = await upsertSendingLog(userId, bulkSendId, draft);
      await recordSendFailure(draft.id, emailLog.id, 'INVALID_EMAIL', message, 0);
      progress.failed++;
      progress.pending--;
      progress.errors.push({ generatedEmailId: draftId, message });
      return;
    }

    if (!draft.resumeId) {
      const emailLog = await upsertSendingLog(userId, bulkSendId, draft);
      await recordSendFailure(
        draft.id,
        emailLog.id,
        'ATTACHMENT_ERROR',
        'Draft has no resume attached',
        0,
      );
      progress.failed++;
      progress.pending--;
      progress.errors.push({ generatedEmailId: draftId, message: 'Draft has no resume attached' });
      return;
    }

    const emailLog = await upsertSendingLog(userId, bulkSendId, draft);

    let success = false;
    let lastError: unknown;
    let attemptsUsed = 0;
    const maxAttempts = env.BULK_SEND_MAX_RETRIES + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attemptsUsed = attempt + 1;
      try {
        const gmailMessageId = await gmailService.sendMessage(userId, {
          to: draft.recipientEmail,
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          bodyPlainText: draft.bodyPlainText ?? '',
          resumeId: draft.resumeId,
        });

        await recordSendSuccess(userId, draft, emailLog.id, gmailMessageId);
        success = true;
        break;
      } catch (err) {
        lastError = err;
        const reason = mapFailureReason(err);

        if (reason === 'GMAIL_NOT_CONNECTED' || reason === 'INVALID_EMAIL') {
          break;
        }

        if (attempt < maxAttempts - 1) {
          await sleep(retryBackoffMs(attempt, reason));
        }
      }
    }

    if (success) {
      progress.sent++;
    } else {
      const reason = mapFailureReason(lastError);
      const message = lastError instanceof Error ? lastError.message : 'Send failed';

      await recordSendFailure(draft.id, emailLog.id, reason, message, attemptsUsed);
      progress.failed++;
      progress.errors.push({ generatedEmailId: draftId, message });
    }

    progress.pending--;
  },

  async retryFailed(userId: string, bulkSendId: string) {
    const original = await reconstructJobFromLogs(userId, bulkSendId);
    if (!original) {
      throw new NotFoundError('Bulk send job', bulkSendId);
    }

    const failedLogs = await prisma.emailLog.findMany({
      where: { bulkSendId, userId, status: 'FAILED' },
      select: { generatedEmailId: true },
    });

    const draftIds = failedLogs
      .map((l) => l.generatedEmailId)
      .filter((id): id is string => Boolean(id));

    if (draftIds.length === 0) {
      throw new ValidationError('No failed drafts to retry in this batch');
    }

    await prisma.generatedEmail.updateMany({
      where: { id: { in: draftIds }, userId, status: 'FAILED' },
      data: { status: 'APPROVED' },
    });

    const newBulkSendId = randomUUID();
    const progress: BulkSendProgress = {
      bulkSendId: newBulkSendId,
      userId,
      status: 'queued',
      total: draftIds.length,
      sent: 0,
      failed: 0,
      pending: draftIds.length,
      startedAt: new Date().toISOString(),
      errors: [],
    };
    jobs.set(newBulkSendId, progress);

    void this.processQueue(userId, newBulkSendId, draftIds, env.BULK_SEND_DELAY_SECONDS).catch(
      (err) => {
        console.error('[bulk-send] retry queue failed', newBulkSendId, err);
      },
    );

    return { bulkSendId: newBulkSendId, count: draftIds.length, retriedFrom: bulkSendId };
  },
};
