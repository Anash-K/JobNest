/**
 * Pipeline status values for JobLead and Application entities.
 * Order reflects the typical outreach lifecycle (Kanban column order).
 */
export const PIPELINE_STATUS = {
  NEW: 'NEW',
  READY_TO_APPLY: 'READY_TO_APPLY',
  APPLIED: 'APPLIED',
  REPLIED: 'REPLIED',
  INTERVIEW: 'INTERVIEW',
  REJECTED: 'REJECTED',
  OFFER: 'OFFER',
} as const;

export type PipelineStatus = (typeof PIPELINE_STATUS)[keyof typeof PIPELINE_STATUS];

/** Kanban column display order — fixed left-to-right sequence in the UI. */
export const PIPELINE_STATUS_ORDER: readonly PipelineStatus[] = [
  PIPELINE_STATUS.NEW,
  PIPELINE_STATUS.READY_TO_APPLY,
  PIPELINE_STATUS.APPLIED,
  PIPELINE_STATUS.REPLIED,
  PIPELINE_STATUS.INTERVIEW,
  PIPELINE_STATUS.OFFER,
  PIPELINE_STATUS.REJECTED,
] as const;

/** Human-readable labels for UI badges and Kanban headers. */
export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  [PIPELINE_STATUS.NEW]: 'New',
  [PIPELINE_STATUS.READY_TO_APPLY]: 'Ready to Apply',
  [PIPELINE_STATUS.APPLIED]: 'Applied',
  [PIPELINE_STATUS.REPLIED]: 'Replied',
  [PIPELINE_STATUS.INTERVIEW]: 'Interview',
  [PIPELINE_STATUS.REJECTED]: 'Rejected',
  [PIPELINE_STATUS.OFFER]: 'Offer',
};

/** Runtime guard — O(1) lookup via Set for request validation. */
const PIPELINE_STATUS_SET = new Set<string>(Object.values(PIPELINE_STATUS));

export function isPipelineStatus(value: unknown): value is PipelineStatus {
  return typeof value === 'string' && PIPELINE_STATUS_SET.has(value);
}

/**
 * Parse comma-separated status filter from query string.
 * Returns only valid enum values; invalid tokens are dropped silently.
 */
export function parsePipelineStatusFilter(raw: string | undefined): PipelineStatus[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(isPipelineStatus);
}
