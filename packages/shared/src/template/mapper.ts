import type { ResolvedVariable } from '../types';
import type { DefaultValues, TemplateLead, VariableMap, VariableResolution } from './types';
import { extractVariables } from './parser';

const DEFAULT_SOURCE = '__default__';

/** Core lead fields addressable via variableMap. */
const CORE_FIELD_GETTERS: Record<string, (lead: TemplateLead) => string | null | undefined> = {
  companyName: (l) => l.companyName,
  receiverName: (l) => l.receiverName,
  receiverEmail: (l) => l.receiverEmail,
  jobTitle: (l) => l.jobTitle,
  location: (l) => l.location,
  salary: (l) => l.salary,
  linkedinUrl: (l) => l.linkedinUrl,
  jobUrl: (l) => l.jobUrl,
  jobDescription: (l) => l.jobDescription,
  notes: (l) => l.notes,
};

function readCustomField(lead: TemplateLead, key: string): string {
  const raw = lead.customFields?.[key];
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

/**
 * Resolve a single mapped source path to a string value from the lead.
 * Supports core fields and customFields.{key} paths.
 */
export function resolveMappedValue(lead: TemplateLead, source: string): string {
  if (source === DEFAULT_SOURCE) return '';

  if (source.startsWith('customFields.')) {
    return readCustomField(lead, source.slice('customFields.'.length));
  }

  const getter = CORE_FIELD_GETTERS[source];
  if (getter) {
    const v = getter(lead);
    return v ? String(v) : '';
  }

  return '';
}

/**
 * Build variable context for all detected template variables.
 * Resolution order per variable: override → mapped lead field → template default.
 */
export function resolveVariables(
  detectedVars: string[],
  lead: TemplateLead,
  variableMap: VariableMap,
  defaultValues: DefaultValues = {},
  overrides: DefaultValues = {},
): VariableResolution {
  const context: Record<string, string> = {};
  const resolved: Record<string, ResolvedVariable> = {};
  const missing: string[] = [];

  for (const varName of detectedVars) {
    if (overrides[varName] !== undefined && overrides[varName] !== '') {
      context[varName] = overrides[varName]!;
      resolved[varName] = { value: overrides[varName]!, source: 'override' };
      continue;
    }

    const mapSource = variableMap[varName];

    if (mapSource && mapSource !== DEFAULT_SOURCE) {
      const value = resolveMappedValue(lead, mapSource);
      if (value) {
        context[varName] = value;
        resolved[varName] = { value, source: `lead.${mapSource}` };
        continue;
      }
    }

    const defaultVal = defaultValues[varName];
    if (defaultVal) {
      context[varName] = defaultVal;
      resolved[varName] = { value: defaultVal, source: 'template.default' };
      continue;
    }

    context[varName] = '';
    missing.push(varName);
  }

  return { context, resolved, missing };
}

/** Re-scan subject + body and return detected variable names. */
export function detectTemplateVariables(subject: string, bodyHtml: string): string[] {
  return extractVariables(subject, bodyHtml);
}
