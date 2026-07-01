import { createHash } from 'crypto';

/** Content fingerprint for draft integrity checks before send. */
export function computePreviewHash(
  subject: string,
  bodyHtml: string,
  recipientEmail: string,
): string {
  return createHash('sha256')
    .update(subject)
    .update('\0')
    .update(bodyHtml)
    .update('\0')
    .update(recipientEmail)
    .digest('hex');
}
