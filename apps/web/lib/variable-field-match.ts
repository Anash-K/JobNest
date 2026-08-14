/**
 * Exact-name auto-match between a detected template variable and an available lead field.
 * Deliberately exact-only (no fuzzy/semantic matching) — ambiguous variables must be mapped manually.
 */
export function matchLeadField(
  varName: string,
  coreFields: string[],
  customFields: string[],
): string | null {
  if (coreFields.includes(varName)) return varName;
  if (customFields.includes(varName)) return `customFields.${varName}`;
  return null;
}
