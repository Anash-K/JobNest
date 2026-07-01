import type { TemplateLead, DefaultValues, VariableMap } from './types';
import { resolveVariables } from './mapper';

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  resolved: Record<string, { value: string; source: string }>;
}

/** Validate that all detected variables resolve for a given lead. */
export function validateLeadVariables(
  detectedVars: string[],
  lead: TemplateLead,
  variableMap: VariableMap,
  defaultValues: DefaultValues = {},
  overrides: DefaultValues = {},
): ValidationResult {
  const { resolved, missing } = resolveVariables(
    detectedVars,
    lead,
    variableMap,
    defaultValues,
    overrides,
  );

  const hasEmail = Boolean(lead.receiverEmail?.trim());

  const allMissing = [...missing];
  if (!hasEmail) {
    allMissing.push('receiverEmail');
  }

  return {
    valid: allMissing.length === 0,
    missing: allMissing,
    resolved,
  };
}
