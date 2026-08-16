/** Matches {{variableName}} placeholders in templates. */
export const VAR_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Rich text editors (e.g. bolding part of a {{variable}}) split the braces
 * and the name across separate inline tags, e.g. `{{<strong>name</strong>}}`.
 * Strip any HTML tags found between a `{{` and its matching `}}` so the
 * variable name is contiguous again before matching against VAR_REGEX.
 */
export function stripTagsInsideVariables(text: string): string {
  return text.replace(/\{\{([\s\S]*?)\}\}/g, (_, inner: string) => `{{${inner.replace(/<[^>]*>/g, '')}}}`);
}

/**
 * Extract unique variable names from template text.
 * O(n) single pass over the string length.
 */
export function extractVariables(...texts: string[]): string[] {
  const found = new Set<string>();

  for (const text of texts) {
    if (!text) continue;
    const re = new RegExp(VAR_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(stripTagsInsideVariables(text))) !== null) {
      found.add(match[1]!);
    }
  }

  return [...found].sort();
}
