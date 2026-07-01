export const LEAD_SOURCE = {
  MANUAL: 'MANUAL',
  EXCEL_IMPORT: 'EXCEL_IMPORT',
  LINKEDIN: 'LINKEDIN',
  OTHER: 'OTHER',
} as const;

export type LeadSource = (typeof LEAD_SOURCE)[keyof typeof LEAD_SOURCE];

const LEAD_SOURCE_SET = new Set<string>(Object.values(LEAD_SOURCE));

export function isLeadSource(value: string): value is LeadSource {
  return LEAD_SOURCE_SET.has(value);
}

export function parseLeadSourceFilter(value: string | undefined): LeadSource | undefined {
  if (!value) return undefined;
  return isLeadSource(value) ? value : undefined;
}
