import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Resolve .env from apps/api root (works with tsx dev and compiled dist/)
dotenv.config({ path: path.join(process.cwd(), '.env') });

const hexKeyRegex = /^[0-9a-fA-F]{64}$/;

/**
 * Environment schema — validated once at startup.
 * Fails fast with clear errors instead of cryptic runtime failures.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((s) => s.startsWith('postgresql://') || s.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().min(1, {
    message: 'GOOGLE_CLIENT_ID is required (global OAuth application)',
  }),
  GOOGLE_CLIENT_SECRET: z.string().min(1, {
    message: 'GOOGLE_CLIENT_SECRET is required (global OAuth application)',
  }),
  GOOGLE_REDIRECT_URI: z.string().url({
    message: 'GOOGLE_REDIRECT_URI must be a valid URL',
  }),
  ENCRYPTION_KEY: z
    .string()
    .length(64, {
      message: 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    })
    .refine((value) => hexKeyRegex.test(value), {
      message: 'ENCRYPTION_KEY must contain only hexadecimal characters',
    }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, { message: 'BETTER_AUTH_SECRET must be at least 32 characters' }),
  BETTER_AUTH_URL: z.string().url({
    message: 'BETTER_AUTH_URL must be the API base URL (e.g. http://localhost:4000)',
  }),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_RESUME_SIZE_MB: z.coerce.number().int().positive().default(5),
  BULK_SEND_DELAY_SECONDS: z.coerce.number().int().min(20).max(60).default(25),
  BULK_SEND_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  BULK_SEND_DAILY_WARN_THRESHOLD: z.coerce.number().int().positive().default(400),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    console.error('❌ Invalid environment configuration:', formatted);
    process.exit(1);
  }

  return parsed.data;
}

/** Singleton config — read-only after bootstrap. */
export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
