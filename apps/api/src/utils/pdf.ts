import { ValidationError } from './errors';

/** Validates PDF magic bytes — defense-in-depth beyond MIME type checks. */
export function assertPdfBuffer(buffer: Buffer): void {
  if (buffer.length < 5) {
    throw new ValidationError('File is not a valid PDF');
  }

  // PDF spec allows up to 1024 bytes of non-PDF data before the %PDF signature
  const headerSize = Math.min(buffer.length, 1024);
  const headerBuffer = buffer.subarray(0, headerSize);

  if (headerBuffer.indexOf('%PDF') === -1) {
    throw new ValidationError('File is not a valid PDF');
  }
}
