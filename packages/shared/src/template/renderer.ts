import { VAR_REGEX } from './parser';

/**
 * Replace {{variables}} with context values.
 * Unresolved variables become empty strings in output.
 */
export function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replace(new RegExp(VAR_REGEX.source, 'g'), (_, key: string) => {
    return context[key] ?? '';
  });
}
