/** Matches {{variableName}} placeholders in templates. */
export const VAR_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

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
    while ((match = re.exec(text)) !== null) {
      found.add(match[1]!);
    }
  }

  return [...found].sort();
}
