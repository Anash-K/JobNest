import { VAR_REGEX, stripTagsInsideVariables } from './parser';

/**
 * Replace {{variables}} with context values.
 * Unresolved variables become empty strings in output.
 *
 * Runs stripTagsInsideVariables first so a placeholder split by inline
 * formatting (e.g. `{{<strong>name</strong>}}` from bolding part of the
 * variable in a rich text editor) still resolves instead of being left
 * untouched in the output.
 */
export function renderTemplate(template: string, context: Record<string, string>): string {
  return stripTagsInsideVariables(template).replace(new RegExp(VAR_REGEX.source, 'g'), (_, key: string) => {
    return context[key] ?? '';
  });
}
