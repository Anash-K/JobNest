'use client';

interface DraftHtmlPreviewProps {
  html: string;
  className?: string;
}

/**
 * Sandboxed iframe preview — prevents inline script execution in the parent React tree (XSS).
 * Per IMPLEMENTATION.md §8 draft preview sandbox.
 */
export function DraftHtmlPreview({ html, className }: DraftHtmlPreviewProps) {
  return (
    <iframe
      title="Email HTML preview"
      sandbox=""
      srcDoc={html}
      className={className ?? 'h-80 w-full rounded-md border bg-white'}
    />
  );
}
