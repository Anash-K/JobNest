/**
 * Email log status — tracks each Gmail send attempt.
 */
export const EMAIL_LOG_STATUS = {
  PENDING: 'PENDING',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type EmailLogStatus = (typeof EMAIL_LOG_STATUS)[keyof typeof EMAIL_LOG_STATUS];

/**
 * Failure reasons stored on email_logs for fault tolerance and retry decisions.
 */
export const EMAIL_FAILURE_REASON = {
  INVALID_EMAIL: 'INVALID_EMAIL',
  GMAIL_LIMIT: 'GMAIL_LIMIT',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  ATTACHMENT_ERROR: 'ATTACHMENT_ERROR',
  MISSING_VARIABLES: 'MISSING_VARIABLES',
  GMAIL_NOT_CONNECTED: 'GMAIL_NOT_CONNECTED',
  DRAFT_NOT_APPROVED: 'DRAFT_NOT_APPROVED',
  DRAFT_INVALID: 'DRAFT_INVALID',
} as const;

export type EmailFailureReason =
  (typeof EMAIL_FAILURE_REASON)[keyof typeof EMAIL_FAILURE_REASON];

/** Failures that qualify for automatic retry with backoff. */
export const RETRYABLE_FAILURE_REASONS: readonly EmailFailureReason[] = [
  EMAIL_FAILURE_REASON.NETWORK_ERROR,
  EMAIL_FAILURE_REASON.TIMEOUT,
  EMAIL_FAILURE_REASON.GMAIL_LIMIT,
] as const;

const EMAIL_LOG_STATUS_SET = new Set<string>(Object.values(EMAIL_LOG_STATUS));

export function isEmailLogStatus(value: unknown): value is EmailLogStatus {
  return typeof value === 'string' && EMAIL_LOG_STATUS_SET.has(value);
}

export function isRetryableFailure(reason: EmailFailureReason | null | undefined): boolean {
  if (!reason) return false;
  return (RETRYABLE_FAILURE_REASONS as readonly string[]).includes(reason);
}
