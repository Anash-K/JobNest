import fs from 'fs/promises';

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeHeaderValue(value: string): string {
  return /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=` : value;
}

/**
 * Build a multipart/mixed MIME message for Gmail API (HTML + plain + PDF).
 * Content is taken from the approved draft — not re-rendered at send time.
 */
export async function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyPlainText: string;
  attachmentPath: string;
  attachmentName: string;
}): Promise<string> {
  const mixedBoundary = `mixed_${Date.now()}`;
  const altBoundary = `alt_${Date.now()}`;
  const pdfBuffer = await fs.readFile(params.attachmentPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeaderValue(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.bodyPlainText,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.bodyHtml,
    '',
    `--${altBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${params.attachmentName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${params.attachmentName}"`,
    '',
    pdfBase64,
    '',
    `--${mixedBoundary}--`,
  ];

  return lines.join('\r\n');
}

/** Gmail API expects URL-safe base64 of the raw MIME message. */
export function encodeMimeForGmail(mime: string): string {
  return base64UrlEncode(Buffer.from(mime, 'utf8'));
}
