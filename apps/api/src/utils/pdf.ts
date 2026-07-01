import { ValidationError } from './errors';

/** Validates PDF magic bytes — defense-in-depth beyond MIME type checks. */
export function assertPdfBuffer(buffer: Buffer): void {
  if (buffer.length < 5 || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new ValidationError('File is not a valid PDF');
  }
}
