/**
 * Normalize a human-authored label into a camelCase field key.
 * "Years of Experience" -> "yearsOfExperience", "LinkedIn URL" -> "linkedinUrl".
 *
 * Apply this exactly once, only to human-authored labels (a typed custom-field
 * name, or a CSV column header) — never to an already-normalized key or a
 * template variable name. It is not idempotent on camelCase input (re-applying
 * it would lowercase internal capitals), so re-normalizing an already-normalized
 * key will corrupt it.
 */
export function normalizeFieldName(label: string): string {
  const words = label
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (words.length === 0) return '';

  const key = words
    .map((word, i) => {
      const lower = word.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');

  return /^[0-9]/.test(key) ? `_${key}` : key;
}
