/**
 * Generated email draft lifecycle — Email Build & Review layer.
 * Sending is only permitted when status is APPROVED.
 */
export const GENERATED_EMAIL_STATUS = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type GeneratedEmailStatus =
  (typeof GENERATED_EMAIL_STATUS)[keyof typeof GENERATED_EMAIL_STATUS];

const GENERATED_EMAIL_STATUS_SET = new Set<string>(
  Object.values(GENERATED_EMAIL_STATUS),
);

export function isGeneratedEmailStatus(
  value: unknown,
): value is GeneratedEmailStatus {
  return typeof value === 'string' && GENERATED_EMAIL_STATUS_SET.has(value);
}

/** Drafts that can be edited or deleted. */
export const EDITABLE_GENERATED_EMAIL_STATUSES: readonly GeneratedEmailStatus[] = [
  GENERATED_EMAIL_STATUS.DRAFT,
  GENERATED_EMAIL_STATUS.FAILED,
] as const;

/** Only approved drafts may enter the bulk send queue. */
export const SENDABLE_GENERATED_EMAIL_STATUSES: readonly GeneratedEmailStatus[] = [
  GENERATED_EMAIL_STATUS.APPROVED,
] as const;
