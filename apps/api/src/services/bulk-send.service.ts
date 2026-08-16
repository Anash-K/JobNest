import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { gmailService } from './gmail.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type {
  BulkSendStatus,
  EmailFailureReason,
  GeneratedEmail,
  Prisma,
} from '../generated/prisma/client';

export interface BulkSendProgress {
  bulkSendId: string;
  userId: string;
  status: 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled';
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  currentEmail?: string;
  currentCompany?: string;
  startedAt: string;
  completedAt?: string;
  errors: Array<{ generatedEmailId: string; message: string }>;
  skippedDetails: Array<{ generatedEmailId: string; leadId: string; reason: 'ALREADY_SENT' | 'SEND_IN_PROGRESS' }>;
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
  duplicateLeadsSkipped: number;
}

const jobs = new Map<string, BulkSendProgress>();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The inter-send delay (20-60s) is where a cancellation request will almost always land —
 * actual Gmail round-trips are fast by comparison. Sleeping in 1s slices and re-checking
 * `progress.status` lets a stop request take effect within ~1s instead of waiting out the
 * rest of the delay.
 */
async function interruptibleSleep(ms: number, progress: BulkSendProgress): Promise<void> {
  const stepMs = 1000;
  let remaining = ms;
  while (remaining > 0 && progress.status !== 'cancelling') {
    await sleep(Math.min(stepMs, remaining));
    remaining -= stepMs;
  }
}

/**
 * TS narrows `progress.status` to the literal assigned just above a loop and doesn't
 * invalidate that narrowing across an `await` on a method call, even though the callee
 * mutates `.status` through the same reference. Reading it back through a function with an
 * explicit return type forces the widen so the cancellation check isn't optimized away.
 */
function currentStatus(progress: BulkSendProgress): BulkSendProgress['status'] {
  return progress.status;
}

function dbStatusToProgressStatus(status: BulkSendStatus): BulkSendProgress['status'] {
  switch (status) {
    case 'RUNNING':
      return 'running';
    case 'CANCELLING':
      return 'cancelling';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
  }
}

function jitterMs(baseSeconds: number): number {
  const base = baseSeconds * 1000;
  return base + Math.floor(Math.random() * 5000);
}

function retryBackoffMs(attempt: number, reason: EmailFailureReason): number {
  if (reason === 'GMAIL_LIMIT') return 60_000;
  return 2000 * (attempt + 1);
}

/** Duck-typed check matching the convention already used in middleware/error-handler.ts. */
function isPrismaKnownRequestError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'PrismaClientKnownRequestError' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

function isUniqueConstraintError(err: unknown): boolean {
  return isPrismaKnownRequestError(err) && err.code === 'P2002';
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
  if (code === 'TIMEOUT') return 'TIMEOUT';

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
    return [...new Set(input.generatedEmailIds)];
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

/**
 * A bulk selection can reference two different GeneratedEmail drafts that both belong
 * to the same lead (e.g. one draft built weeks ago, another built again today). Sending
 * both would be a real duplicate even though the draft ids differ. Keep only the first
 * draft per lead, preserving the caller's ordering.
 */
async function dedupeDraftsByLead(
  userId: string,
  ids: string[],
): Promise<{ ids: string[]; droppedCount: number }> {
  if (ids.length <= 1) return { ids, droppedCount: 0 };

  const drafts = await prisma.generatedEmail.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, leadId: true },
  });
  const leadById = new Map(drafts.map((d) => [d.id, d.leadId]));

  const seenLeads = new Set<string>();
  const kept: string[] = [];
  let droppedCount = 0;

  for (const id of ids) {
    const leadId = leadById.get(id);
    if (!leadId) {
      // Unknown/foreign id — let the existing missing-draft validation surface this.
      kept.push(id);
      continue;
    }
    if (seenLeads.has(leadId)) {
      droppedCount++;
      continue;
    }
    seenLeads.add(leadId);
    kept.push(id);
  }

  return { ids: kept, droppedCount };
}

function assertRecipientEmail(email: string): void {
  if (!EMAIL_REGEX.test(email.trim())) {
    throw new ValidationError(`Invalid recipient email: ${email}`, { code: 'INVALID_EMAIL' });
  }
}

type ClaimOutcome =
  | { outcome: 'claimed'; emailLogId: string }
  | { outcome: 'already_sent'; emailLogId: string | null }
  | { outcome: 'in_progress'; emailLogId: string | null };

/**
 * Atomically reserve the right to send this draft before Gmail is ever called.
 *
 * This is the core idempotency gate: it must be impossible for two concurrent
 * requests — for the same draft, or for two different drafts belonging to the same
 * lead/template/campaign — to both walk away with `outcome: 'claimed'`. Rather than a
 * read-then-write check (which two racing requests could both pass), every write here
 * is a single conditional DB operation (`create`, or `updateMany` scoped by current
 * status) whose success/failure is decided by Postgres itself — either the unique
 * constraint on `generatedEmailId`, or the partial unique index on
 * (userId, jobLeadId, templateId, campaignId) for SENDING/SENT rows (see the
 * `email_log_outreach_dedupe` migration). Only one caller can ever win.
 */
async function claimSendSlot(
  userId: string,
  bulkSendId: string,
  draft: GeneratedEmail,
): Promise<ClaimOutcome> {
  const existing = await prisma.emailLog.findUnique({ where: { generatedEmailId: draft.id } });

  if (existing?.status === 'SENT') {
    return { outcome: 'already_sent', emailLogId: existing.id };
  }
  if (existing?.status === 'SENDING') {
    return { outcome: 'in_progress', emailLogId: existing.id };
  }

  if (existing) {
    // FAILED (or legacy PENDING) — reclaim this exact row for a retry. The `where`
    // requires the status to still match what we just read, so a concurrent claimant
    // that already flipped it away from FAILED/PENDING causes this update to affect
    // zero rows instead of racing past it. The update can also violate the partial
    // outreach index directly (if a *different* draft for this lead/template/campaign
    // is concurrently SENDING/SENT), so P2002 must be handled here too, not just on
    // insert.
    try {
      const claim = await prisma.emailLog.updateMany({
        where: { id: existing.id, status: existing.status },
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

      if (claim.count === 1) {
        return { outcome: 'claimed', emailLogId: existing.id };
      }

      const current = await prisma.emailLog.findUnique({ where: { id: existing.id } });
      return current?.status === 'SENT'
        ? { outcome: 'already_sent', emailLogId: current.id }
        : { outcome: 'in_progress', emailLogId: current?.id ?? existing.id };
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;

      const byOutreach = await prisma.emailLog.findFirst({
        where: {
          userId,
          jobLeadId: draft.leadId,
          templateId: draft.templateId,
          campaignId: draft.campaignId,
          status: { in: ['SENDING', 'SENT'] },
        },
      });
      return byOutreach?.status === 'SENT'
        ? { outcome: 'already_sent', emailLogId: byOutreach.id }
        : { outcome: 'in_progress', emailLogId: byOutreach?.id ?? existing.id };
    }
  }

  try {
    const created = await prisma.emailLog.create({
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
    return { outcome: 'claimed', emailLogId: created.id };
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;

    // Lost the race. Figure out whether it was a concurrent request for this exact
    // draft, or a different draft for the same lead/template/campaign, purely to
    // report a useful outcome — either way, we do not send.
    const byDraft = await prisma.emailLog.findUnique({ where: { generatedEmailId: draft.id } });
    if (byDraft) {
      return byDraft.status === 'SENT'
        ? { outcome: 'already_sent', emailLogId: byDraft.id }
        : { outcome: 'in_progress', emailLogId: byDraft.id };
    }

    const byOutreach = await prisma.emailLog.findFirst({
      where: {
        userId,
        jobLeadId: draft.leadId,
        templateId: draft.templateId,
        campaignId: draft.campaignId,
        status: { in: ['SENDING', 'SENT'] },
      },
    });
    return byOutreach?.status === 'SENT'
      ? { outcome: 'already_sent', emailLogId: byOutreach.id }
      : { outcome: 'in_progress', emailLogId: byOutreach?.id ?? null };
  }
}

async function recordSendSuccess(
  userId: string,
  draft: GeneratedEmail,
  emailLogId: string,
  gmailMessageId: string,
  gmailThreadId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.emailLog.update({
      where: { id: emailLogId },
      data: { status: 'SENT', gmailMessageId, gmailThreadId, sentAt: new Date() },
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

const PERSIST_SUCCESS_RETRY_ATTEMPTS = 5;

/**
 * Once Gmail has accepted a message, sending it again is not an option — so this
 * retries only the DB write, never the Gmail call. `recordSendSuccess` is naturally
 * idempotent here: it re-applies the same gmailMessageId/threadId every attempt.
 *
 * If persistence still fails after every attempt, the EmailLog/GeneratedEmail rows
 * are deliberately left at SENDING/APPROVED rather than FAILED — marking them FAILED
 * would make `retryFailed` pick them up and call Gmail a second time for an email
 * that already went out. A stuck SENDING row here means "sent, unconfirmed" and
 * needs manual reconciliation (see the CRITICAL log line), not an automatic retry.
 */
async function persistSendSuccessWithRetry(
  userId: string,
  draft: GeneratedEmail,
  emailLogId: string,
  gmailMessageId: string,
  gmailThreadId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= PERSIST_SUCCESS_RETRY_ATTEMPTS; attempt++) {
    try {
      await recordSendSuccess(userId, draft, emailLogId, gmailMessageId, gmailThreadId);
      return true;
    } catch (err) {
      console.error(
        `[bulk-send] CRITICAL: Gmail accepted message ${gmailMessageId} for generatedEmail=${draft.id} ` +
          `(emailLog=${emailLogId}) but persisting the SENT state failed ` +
          `(attempt ${attempt}/${PERSIST_SUCCESS_RETRY_ATTEMPTS}). Not resending — manual reconciliation required.`,
        err,
      );
      if (attempt < PERSIST_SUCCESS_RETRY_ATTEMPTS) {
        await sleep(500 * attempt);
      }
    }
  }
  return false;
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
  const [logs, bulkSendRecord] = await Promise.all([
    prisma.emailLog.findMany({
      where: { userId, bulkSendId },
      select: {
        status: true,
        generatedEmailId: true,
        failureMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.bulkSend.findUnique({ where: { id: bulkSendId } }),
  ]);

  const bulkSend = bulkSendRecord && bulkSendRecord.userId === userId ? bulkSendRecord : null;
  if (logs.length === 0 && !bulkSend) return null;

  const sent = logs.filter((l) => l.status === 'SENT').length;
  const failed = logs.filter((l) => l.status === 'FAILED').length;
  const inFlight = logs.filter((l) => l.status === 'SENDING' || l.status === 'PENDING').length;
  const errors = logs
    .filter((l) => l.status === 'FAILED' && l.generatedEmailId)
    .map((l) => ({
      generatedEmailId: l.generatedEmailId!,
      message: l.failureMessage ?? 'Send failed',
    }));

  // The BulkSend record (created once per operation since the cancellation feature) is the
  // authoritative status source — in particular it's the only way to report `cancelled`
  // after a server restart wipes the in-memory job. Older bulk sends predating that record
  // fall back to inferring running/completed from the EmailLog rows, as before.
  const status = bulkSend ? dbStatusToProgressStatus(bulkSend.status) : inFlight > 0 ? 'running' : 'completed';
  const isTerminal = status === 'completed' || status === 'cancelled';

  return {
    bulkSendId,
    userId,
    status,
    total: bulkSend?.total ?? logs.length,
    sent,
    failed,
    // Skipped (already-sent) drafts never create an EmailLog row, so they cannot be
    // reconstructed from this table after a server restart — a pre-existing
    // limitation of this in-memory-first job model, unchanged by this fix.
    skipped: 0,
    pending: inFlight,
    startedAt: (bulkSend?.createdAt ?? logs[0]?.createdAt ?? new Date()).toISOString(),
    completedAt: isTerminal ? (bulkSend?.completedAt ?? new Date()).toISOString() : undefined,
    errors,
    skippedDetails: [],
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
    const rawIds = await resolveDraftIds(userId, input);
    if (rawIds.length === 0) throw new ValidationError('No drafts selected');

    const { ids, droppedCount: duplicateLeadsSkipped } = await dedupeDraftsByLead(userId, rawIds);
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
      duplicateLeadsSkipped,
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
    const rawIds = await resolveDraftIds(userId, input);
    const { ids } = await dedupeDraftsByLead(userId, rawIds);
    const bulkSendId = randomUUID();
    const delaySeconds = input.delaySeconds ?? env.BULK_SEND_DELAY_SECONDS;

    const progress: BulkSendProgress = {
      bulkSendId,
      userId,
      status: 'queued',
      total: validation.count,
      sent: 0,
      failed: 0,
      skipped: 0,
      pending: validation.count,
      startedAt: new Date().toISOString(),
      errors: [],
      skippedDetails: [],
    };
    jobs.set(bulkSendId, progress);

    // Durable record backing the /cancel endpoint — see `cancelBulkSend`. Created before the
    // queue starts so a cancel request racing the very first lead always finds a row to act on.
    await prisma.bulkSend.create({
      data: { id: bulkSendId, userId, status: 'RUNNING', total: validation.count },
    });

    void this.processQueue(userId, bulkSendId, ids, delaySeconds).catch((err) => {
      console.error('[bulk-send] queue failed', bulkSendId, err);
      const job = jobs.get(bulkSendId);
      if (job && job.status !== 'completed' && job.status !== 'cancelled') {
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
        // Checked before claiming the next lead, never mid-send: a cancellation request
        // must let whatever is currently in flight finish normally (SENT/FAILED) and only
        // stop leads that haven't been claimed yet.
        if (currentStatus(progress) === 'cancelling') break;

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
          await interruptibleSleep(jitterMs(delaySeconds), progress);
        }
      }
    } finally {
      const cancelled = currentStatus(progress) === 'cancelling';
      progress.status = cancelled ? 'cancelled' : 'completed';
      progress.completedAt = new Date().toISOString();
      progress.currentEmail = undefined;
      progress.currentCompany = undefined;

      await prisma.bulkSend
        .update({
          where: { id: bulkSendId },
          data: { status: cancelled ? 'CANCELLED' : 'COMPLETED', completedAt: new Date() },
        })
        .catch((err) => {
          console.error('[bulk-send] failed to persist terminal status', bulkSendId, err);
        });
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

    if (draft.status === 'SENT') {
      // This exact draft was already delivered (e.g. included twice across retries,
      // or a "send all approved" run repeated after completion) — a true no-op.
      progress.skipped++;
      progress.pending--;
      progress.skippedDetails.push({
        generatedEmailId: draftId,
        leadId: draft.leadId,
        reason: 'ALREADY_SENT',
      });
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

    // Atomically claim the right to send BEFORE any validation or Gmail call. This is
    // the authoritative duplicate guard: it also catches the case where a *different*
    // GeneratedEmail draft for the same lead/template/campaign already sent (or is
    // currently sending) — the actual production bug this fix addresses.
    const claim = await claimSendSlot(userId, bulkSendId, draft);

    if (claim.outcome === 'already_sent' || claim.outcome === 'in_progress') {
      progress.skipped++;
      progress.pending--;
      progress.skippedDetails.push({
        generatedEmailId: draftId,
        leadId: draft.leadId,
        reason: claim.outcome === 'already_sent' ? 'ALREADY_SENT' : 'SEND_IN_PROGRESS',
      });
      return;
    }

    const emailLogId = claim.emailLogId;

    try {
      assertRecipientEmail(draft.recipientEmail);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid email';
      await recordSendFailure(draft.id, emailLogId, 'INVALID_EMAIL', message, 0);
      progress.failed++;
      progress.pending--;
      progress.errors.push({ generatedEmailId: draftId, message });
      return;
    }

    if (!draft.resumeId) {
      await recordSendFailure(
        draft.id,
        emailLogId,
        'ATTACHMENT_ERROR',
        'Draft has no resume attached',
        0,
      );
      progress.failed++;
      progress.pending--;
      progress.errors.push({ generatedEmailId: draftId, message: 'Draft has no resume attached' });
      return;
    }

    // Only the Gmail call itself is retried here. Once it succeeds, we must never
    // call it again — persistence failures are retried separately, below.
    let gmailResult: { messageId: string; threadId: string } | null = null;
    let lastError: unknown;
    let attemptsUsed = 0;
    const maxAttempts = env.BULK_SEND_MAX_RETRIES + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attemptsUsed = attempt + 1;
      try {
        gmailResult = await gmailService.sendMessage(userId, {
          to: draft.recipientEmail,
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          bodyPlainText: draft.bodyPlainText ?? '',
          resumeId: draft.resumeId,
        });
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

    if (!gmailResult) {
      const reason = mapFailureReason(lastError);
      const message = lastError instanceof Error ? lastError.message : 'Send failed';

      await recordSendFailure(draft.id, emailLogId, reason, message, attemptsUsed);
      progress.failed++;
      progress.errors.push({ generatedEmailId: draftId, message });
      progress.pending--;
      return;
    }

    const persisted = await persistSendSuccessWithRetry(
      userId,
      draft,
      emailLogId,
      gmailResult.messageId,
      gmailResult.threadId,
    );

    progress.sent++;
    if (!persisted) {
      // Gmail genuinely delivered this — it must be counted as sent, never as
      // failed/retryable. Surface it loudly so it can be reconciled manually.
      progress.errors.push({
        generatedEmailId: draftId,
        message:
          `Sent via Gmail (message ${gmailResult.messageId}) but could not be recorded — ` +
          'verify manually in EmailLog, do not resend.',
      });
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
      skipped: 0,
      pending: draftIds.length,
      startedAt: new Date().toISOString(),
      errors: [],
      skippedDetails: [],
    };
    jobs.set(newBulkSendId, progress);

    await prisma.bulkSend.create({
      data: { id: newBulkSendId, userId, status: 'RUNNING', total: draftIds.length },
    });

    void this.processQueue(userId, newBulkSendId, draftIds, env.BULK_SEND_DELAY_SECONDS).catch(
      (err) => {
        console.error('[bulk-send] retry queue failed', newBulkSendId, err);
      },
    );

    return { bulkSendId: newBulkSendId, count: draftIds.length, retriedFrom: bulkSendId };
  },

  /**
   * Request cancellation of an active bulk-send operation. Never touches Gmail or EmailLog
   * directly — it only flips the BulkSend status (and, best-effort, the live in-memory
   * progress object) so `processQueue`'s own loop stops claiming new leads on its next
   * check. This keeps `claimSendSlot`'s atomic idempotency guarantees completely untouched:
   * a lead already claimed as SENDING is never reconsidered because of cancellation.
   */
  async cancelBulkSend(userId: string, bulkSendId: string): Promise<BulkSendProgress> {
    const record = await prisma.bulkSend.findUnique({ where: { id: bulkSendId } });
    if (!record || record.userId !== userId) {
      throw new NotFoundError('Bulk send job', bulkSendId);
    }

    if (record.status === 'COMPLETED' || record.status === 'CANCELLED') {
      throw new ValidationError('Bulk send has already finished and cannot be cancelled', {
        status: record.status,
      });
    }

    const liveJob = this.getJob(userId, bulkSendId);
    if (liveJob && (liveJob.status === 'running' || liveJob.status === 'queued')) {
      // The loop reads this directly on its next per-lead check and during its interruptible
      // delay — no extra signalling needed since both run in the same process.
      liveJob.status = 'cancelling';
    }

    // Atomic, conditional: only ever flips a row that is still RUNNING. A second concurrent
    // call (or one that lands after the loop already finished) matches zero rows and is a
    // harmless no-op — idempotency falls out of the WHERE clause, not a special case.
    await prisma.bulkSend.updateMany({
      where: { id: bulkSendId, status: 'RUNNING' },
      data: { status: 'CANCELLING' },
    });

    if (!liveJob) {
      // No loop is actively running for this job in this process — either the server
      // restarted since `start()`, or it already finished draining. Nothing will ever
      // observe CANCELLING and carry it the rest of the way, so finish the transition here
      // instead of leaving the record stuck.
      await prisma.bulkSend.updateMany({
        where: { id: bulkSendId, status: { in: ['RUNNING', 'CANCELLING'] } },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
    }

    return (
      liveJob ??
      (await reconstructJobFromLogs(userId, bulkSendId)) ?? {
        bulkSendId,
        userId,
        status: 'cancelled',
        total: record.total,
        sent: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        startedAt: record.createdAt.toISOString(),
        completedAt: new Date().toISOString(),
        errors: [],
        skippedDetails: [],
      }
    );
  },
};
