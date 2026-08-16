import { LEAD_CORE_FIELDS } from '@jobhunter/shared';
import type { JobLead } from './api';

/** Optional core fields that stay hidden on the form until they carry a value. */
const OPTIONAL_CORE_FIELDS = ['linkedinUrl', 'jobUrl', 'jobDescription', 'notes'] as const;

export type CoreFieldState = Record<(typeof LEAD_CORE_FIELDS)[number] | 'campaignId', string>;

export type AutofillMode = 'missing' | 'replace';

export interface LeadFormFieldState {
  core: CoreFieldState;
  customFields: Record<string, string>;
  customFieldLabels: Record<string, string>;
}

export interface LeadAutofillPatch extends LeadFormFieldState {
  /** Optional core fields that should be revealed because they now carry a value. */
  revealedCoreFields: Set<string>;
}

export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Maps an existing lead's field values onto a new-lead form's current state.
 * The source lead is read-only input here — this never mutates it.
 *
 * - 'missing': only fills fields that are currently blank on the form.
 * - 'replace': overwrites any field the source lead has a value for.
 *
 * Either way, a field the source lead doesn't have is left exactly as-is —
 * autofill never blanks out something the user already typed.
 */
export function applyLeadAutofill(
  source: JobLead,
  current: LeadFormFieldState,
  mode: AutofillMode,
): LeadAutofillPatch {
  const shouldSet = (currentValue: string) => mode === 'replace' || !currentValue.trim();

  const core = { ...current.core };
  for (const field of LEAD_CORE_FIELDS) {
    const sourceValue = source[field];
    if (sourceValue === undefined || sourceValue === null || sourceValue === '') continue;
    if (shouldSet(core[field])) core[field] = String(sourceValue);
  }
  if (source.campaignId && shouldSet(core.campaignId)) {
    core.campaignId = source.campaignId;
  }

  const customFields = { ...current.customFields };
  const customFieldLabels = { ...current.customFieldLabels };
  for (const [key, value] of Object.entries(source.customFields ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    if (shouldSet(customFields[key] ?? '')) customFields[key] = String(value);
    if (!(key in customFieldLabels)) {
      customFieldLabels[key] = source.customFieldLabels?.[key] ?? humanizeKey(key);
    }
  }

  const revealedCoreFields = new Set<string>();
  for (const field of OPTIONAL_CORE_FIELDS) {
    if (core[field]) revealedCoreFields.add(field);
  }

  return { core, customFields, customFieldLabels, revealedCoreFields };
}

/** Short "job title · email" subtitle for a lead search result or selected-lead chip. */
export function describeLead(lead: JobLead): string {
  return [lead.jobTitle, lead.receiverEmail].filter(Boolean).join(' · ');
}
