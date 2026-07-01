import crypto from 'crypto';
import { env } from '../config/env';
import { ValidationError } from './errors';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length !== 64) {
    throw new ValidationError(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32',
    );
  }
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

/** Encrypt a string for at-rest storage (Gmail tokens). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt a string stored with `encrypt`. */
export function decrypt(payload: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new ValidationError('Invalid encrypted payload format');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}
