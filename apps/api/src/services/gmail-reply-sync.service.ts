import { prisma } from '../lib/prisma';
import type { Prisma, GmailAccount } from '../generated/prisma/client';
import { gmailService, GMAIL_READONLY_SCOPE } from './gmail.service';
import {
  parseGmailMessage,
  extractEmailAddress,
  extractDisplayName,
  type GmailMessageResource,
  type ParsedGmailMessage,
} from '../utils/gmail-message-parser';

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface ActiveOutreach {
  emailLogId: string;
  applicationId: string | null;
  jobLeadId: string | null;
  gmailMessageId: string;
  gmailThreadId: string;
  recipientEmail: string;
}

export interface GmailReplySyncSummary {
  accountsChecked: number;
  accountsSynced: number;
  repliesFound: number;
  noResponseMarked: number;
  errors: number;
  durationMs: number;
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}

function safeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
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

/** Gmail's own auth-class failures — surfaced as needsReconnect, never crash the whole batch. */
function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const details = (err as { details?: { code?: string } }).details;
  if (details?.code === 'GMAIL_NOT_CONNECTED') return true;
  return /\b(401|403)\b/.test(err.message);
}

/**
 * DB-only sweep: flips ACTIVE (APPLIED) outreach past its 7-day deadline to NO_RESPONSE.
 * Deliberately independent of Gmail connectivity — a disconnected/broken Gmail account must
 * not prevent its stale outreach from expiring on schedule.
 */
async function sweepNoResponse(): Promise<number> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);

  const expired = await prisma.application.findMany({
    where: {
      status: 'APPLIED',
      generatedEmail: { emailLog: { status: 'SENT', sentAt: { lt: cutoff } } },
    },
    select: { id: true, jobLeadId: true },
  });

  let marked = 0;
  for (const app of expired) {
    const result = await prisma.application.updateMany({
      where: { id: app.id, status: 'APPLIED' },
      data: { status: 'NO_RESPONSE' },
    });
    if (result.count > 0) {
      marked += result.count;
      await prisma.jobLead.updateMany({
        where: { id: app.jobLeadId, pipelineStatus: 'APPLIED' },
        data: { pipelineStatus: 'NO_RESPONSE' },
      });
    }
  }

  if (marked > 0) log('gmail_outreach_marked_no_response', { count: marked });
  return marked;
}

/**
 * Accounts with at least one currently-ACTIVE outreach record, connected, holding the
 * gmail.readonly scope, and not already flagged needsReconnect. Accounts whose stored
 * scopes lack gmail.readonly are flagged here — before ever calling Gmail — so they're
 * excluded from this query on every subsequent run instead of repeatedly 403ing.
 */
async function findEligibleAccounts(): Promise<GmailAccount[]> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);

  const activeUsers = await prisma.application.findMany({
    where: {
      status: 'APPLIED',
      generatedEmail: {
        emailLog: { status: 'SENT', gmailThreadId: { not: null }, sentAt: { gte: cutoff } },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  if (activeUsers.length === 0) return [];

  const accounts = await prisma.gmailAccount.findMany({
    where: { userId: { in: activeUsers.map((u) => u.userId) }, needsReconnect: false },
  });

  const eligible: GmailAccount[] = [];
  for (const account of accounts) {
    if (!account.scopes.includes(GMAIL_READONLY_SCOPE)) {
      await prisma.gmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
      log('gmail_sync_auth_failed', { userId: account.userId, reason: 'missing_readonly_scope' });
      continue;
    }
    eligible.push(account);
  }

  return eligible;
}

/** The account's currently-ACTIVE outreach, loaded once per sync for in-memory matching. */
async function loadActiveOutreachForUser(userId: string, cutoff: Date): Promise<ActiveOutreach[]> {
  const applications = await prisma.application.findMany({
    where: {
      userId,
      status: 'APPLIED',
      generatedEmail: {
        emailLog: { status: 'SENT', gmailThreadId: { not: null }, sentAt: { gte: cutoff } },
      },
    },
    select: {
      id: true,
      jobLeadId: true,
      generatedEmail: {
        select: {
          emailLog: {
            select: { id: true, gmailMessageId: true, gmailThreadId: true, recipientEmail: true },
          },
        },
      },
    },
  });

  const result: ActiveOutreach[] = [];
  for (const app of applications) {
    const emailLog = app.generatedEmail?.emailLog;
    if (!emailLog?.gmailThreadId || !emailLog.gmailMessageId) continue;
    result.push({
      applicationId: app.id,
      jobLeadId: app.jobLeadId,
      emailLogId: emailLog.id,
      gmailMessageId: emailLog.gmailMessageId,
      gmailThreadId: emailLog.gmailThreadId,
      recipientEmail: emailLog.recipientEmail,
    });
  }
  return result;
}

async function fetchCurrentHistoryId(accessToken: string): Promise<string | null> {
  const res = await fetch(`${GMAIL_API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { historyId?: string };
  return data.historyId ?? null;
}

/**
 * Bounded fallback used both for an account's first-ever sync (no historyId yet) and for
 * history-expiration recovery: inspect only the threads belonging to this account's currently
 * ACTIVE outreach — never a full inbox listing.
 */
async function bootstrapViaActiveThreads(
  accessToken: string,
  activeOutreach: ActiveOutreach[],
): Promise<{ id: string }[]> {
  const messages: { id: string }[] = [];
  const threadIds = [...new Set(activeOutreach.map((o) => o.gmailThreadId))];

  for (const threadId of threadIds) {
    const res = await fetch(`${GMAIL_API_BASE}/threads/${threadId}?format=metadata&metadataHeaders=From`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) continue; // thread inaccessible/deleted — skip, don't fail the whole account
    const data = (await res.json()) as { messages?: GmailMessageResource[] };
    for (const message of data.messages ?? []) {
      if (!(message.labelIds ?? []).includes('SENT')) {
        messages.push({ id: message.id });
      }
    }
  }

  return messages;
}

interface HistoryListResult {
  expired: boolean;
  messages: { id: string }[];
  historyId?: string;
}

/** Normal incremental path — only messages Gmail reports as newly added to INBOX since the cursor. */
async function listHistory(accessToken: string, startHistoryId: string): Promise<HistoryListResult> {
  const messages: { id: string }[] = [];
  let pageToken: string | undefined;
  let historyId: string | undefined;

  do {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      labelId: 'INBOX',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${GMAIL_API_BASE}/history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) {
      return { expired: true, messages: [] };
    }
    if (!res.ok) {
      throw new Error(`Gmail history.list failed with status ${res.status}`);
    }

    const data = (await res.json()) as {
      history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[];
      nextPageToken?: string;
      historyId?: string;
    };

    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        if (!(added.message.labelIds ?? []).includes('SENT')) {
          messages.push({ id: added.message.id });
        }
      }
    }

    historyId = data.historyId ?? historyId;
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { expired: false, messages, historyId };
}

/** Matching priority: threadId -> In-Reply-To -> References -> narrow unambiguous sender fallback. */
function matchOutreach(
  meta: ParsedGmailMessage,
  byThreadId: Map<string, ActiveOutreach>,
  byMessageId: Map<string, ActiveOutreach>,
): ActiveOutreach | null {
  const byThread = byThreadId.get(meta.threadId);
  if (byThread) return byThread;

  if (meta.inReplyTo) {
    const match = byMessageId.get(meta.inReplyTo);
    if (match) return match;
  }

  for (const ref of meta.references) {
    const match = byMessageId.get(ref);
    if (match) return match;
  }

  const senderEmail = extractEmailAddress(meta.from);
  if (senderEmail) {
    const candidates = [...byThreadId.values()].filter(
      (o) => o.recipientEmail.toLowerCase() === senderEmail,
    );
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}

async function createReplyIdempotent(
  userId: string,
  match: ActiveOutreach,
  full: ParsedGmailMessage,
): Promise<boolean> {
  const senderEmail = extractEmailAddress(full.from) ?? full.from ?? 'unknown';
  const senderName = extractDisplayName(full.from);
  const recipientEmail = extractEmailAddress(full.to);
  const parsedDate = full.date ? new Date(full.date) : null;
  const receivedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date();

  try {
    await prisma.emailReply.create({
      data: {
        userId,
        jobLeadId: match.jobLeadId,
        applicationId: match.applicationId,
        emailLogId: match.emailLogId,
        gmailMessageId: full.messageId,
        gmailThreadId: full.threadId,
        senderEmail,
        senderName,
        recipientEmail,
        subject: full.subject,
        bodyHtml: full.bodyHtml,
        bodyPlainText: full.bodyPlainText,
        receivedAt,
        isRead: false,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      log('gmail_reply_duplicate', { userId, gmailMessageId: full.messageId });
      return false;
    }
    throw err;
  }
}

async function applyReplyStatusTransition(match: ActiveOutreach): Promise<void> {
  if (match.applicationId) {
    await prisma.application.updateMany({
      where: { id: match.applicationId, status: 'APPLIED' },
      data: { status: 'REPLIED' },
    });
  }
  if (match.jobLeadId) {
    await prisma.jobLead.updateMany({
      where: { id: match.jobLeadId, pipelineStatus: 'APPLIED' },
      data: { pipelineStatus: 'REPLIED' },
    });
  }
}

/** Two-phase fetch: cheap metadata first for matching, full body only once matched. */
async function processCandidateMessage(
  accessToken: string,
  messageId: string,
  accountEmail: string,
  userId: string,
  byThreadId: Map<string, ActiveOutreach>,
  byMessageId: Map<string, ActiveOutreach>,
): Promise<boolean> {
  const alreadyStored = await prisma.emailReply.findUnique({
    where: { gmailMessageId: messageId },
    select: { id: true },
  });
  if (alreadyStored) return false;

  const metaRes = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}` +
      '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject' +
      '&metadataHeaders=Date&metadataHeaders=In-Reply-To&metadataHeaders=References',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) return false;

  const meta = parseGmailMessage((await metaRes.json()) as GmailMessageResource);

  if (meta.isFromSentFolder) return false;

  const senderEmail = extractEmailAddress(meta.from);
  if (senderEmail && senderEmail === accountEmail.toLowerCase()) return false;

  const match = matchOutreach(meta, byThreadId, byMessageId);
  if (!match) {
    log('gmail_reply_unmatched', { userId, messageId });
    return false;
  }

  const fullRes = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fullRes.ok) return false;

  const full = parseGmailMessage((await fullRes.json()) as GmailMessageResource);
  const created = await createReplyIdempotent(userId, match, full);
  if (!created) return false;

  await applyReplyStatusTransition(match);
  log('gmail_reply_detected', {
    userId,
    applicationId: match.applicationId,
    jobLeadId: match.jobLeadId,
    threadId: match.gmailThreadId,
  });
  return true;
}

async function syncAccount(account: GmailAccount, summary: GmailReplySyncSummary): Promise<void> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const activeOutreach = await loadActiveOutreachForUser(account.userId, cutoff);
  if (activeOutreach.length === 0) return;

  const byThreadId = new Map(activeOutreach.map((o) => [o.gmailThreadId, o]));
  const byMessageId = new Map(activeOutreach.map((o) => [o.gmailMessageId, o]));

  const accessToken = await gmailService.getValidAccessToken(account.userId);

  let candidates: { id: string }[];
  let newHistoryId: string | null;
  let usedRecovery = false;

  if (!account.historyId) {
    usedRecovery = true;
    candidates = await bootstrapViaActiveThreads(accessToken, activeOutreach);
    newHistoryId = await fetchCurrentHistoryId(accessToken);
    log('gmail_sync_history_bootstrap', { userId: account.userId, threadCount: byThreadId.size });
  } else {
    const historyResult = await listHistory(accessToken, account.historyId);
    if (historyResult.expired) {
      usedRecovery = true;
      candidates = await bootstrapViaActiveThreads(accessToken, activeOutreach);
      newHistoryId = await fetchCurrentHistoryId(accessToken);
      log('gmail_sync_history_expired_recovery', { userId: account.userId, threadCount: byThreadId.size });
    } else {
      candidates = historyResult.messages;
      newHistoryId = historyResult.historyId ?? account.historyId;
    }
  }

  let repliesFound = 0;
  for (const candidate of candidates) {
    const matched = await processCandidateMessage(
      accessToken,
      candidate.id,
      account.email,
      account.userId,
      byThreadId,
      byMessageId,
    );
    if (matched) repliesFound++;
  }

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: { historyId: newHistoryId, lastSyncedAt: new Date() },
  });

  summary.repliesFound += repliesFound;
  summary.accountsSynced += 1;
  log('gmail_reply_sync_account_completed', {
    userId: account.userId,
    activeOutreachCount: activeOutreach.length,
    candidateCount: candidates.length,
    repliesFound,
    usedRecovery,
  });
}

export const gmailReplySyncService = {
  sweepNoResponse,
  findEligibleAccounts,

  async run(): Promise<GmailReplySyncSummary> {
    const start = Date.now();
    log('gmail_reply_sync_started');

    const summary: GmailReplySyncSummary = {
      accountsChecked: 0,
      accountsSynced: 0,
      repliesFound: 0,
      noResponseMarked: 0,
      errors: 0,
      durationMs: 0,
    };

    summary.noResponseMarked = await sweepNoResponse();

    const accounts = await findEligibleAccounts();
    summary.accountsChecked = accounts.length;

    for (const account of accounts) {
      try {
        await syncAccount(account, summary);
      } catch (err) {
        summary.errors += 1;
        const authFailure = isAuthError(err);
        if (authFailure) {
          await prisma.gmailAccount.update({
            where: { id: account.id },
            data: { needsReconnect: true },
          });
        }
        log('gmail_sync_auth_failed', {
          userId: account.userId,
          error: safeErrorMessage(err),
          needsReconnect: authFailure,
        });
      }
    }

    summary.durationMs = Date.now() - start;
    log('gmail_reply_sync_completed', summary as unknown as Record<string, unknown>);
    return summary;
  },
};
