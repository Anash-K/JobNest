import type { betterAuth as BetterAuthFn } from 'better-auth';
import type { prismaAdapter as PrismaAdapterFn } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';
import { env } from '../config/env';
import { authService } from '../services/auth.service';

// Trace hint only, never executed: keeps these specifiers visible to
// Vercel's file tracer (@vercel/nft) so better-auth's ESM-only files get
// included in the deployed function. The actual load below is hidden from
// tsc's dynamic-import-to-require downleveling (see importEsm), which the
// tracer can't see through either — hence needing this hint at all.
if (process.env.__BETTER_AUTH_TRACE_HINT__) {
  require('better-auth');
  require('better-auth/adapters/prisma');
}

// tsc's CommonJS output downlevels `import()` into `require()`, which can't
// load better-auth's ESM-only builds. `new Function` hides this call from
// that downleveling so it stays a genuine dynamic import.
const importEsm: (specifier: string) => Promise<any> = new Function('specifier', 'return import(specifier)') as never;

function createAuth() {
  return Promise.all([
    importEsm('better-auth') as Promise<{ betterAuth: typeof BetterAuthFn }>,
    importEsm('better-auth/adapters/prisma') as Promise<{ prismaAdapter: typeof PrismaAdapterFn }>,
  ]).then(([{ betterAuth }, { prismaAdapter }]) =>
    betterAuth({
      database: prismaAdapter(prisma, {
        provider: 'postgresql',
      }),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      basePath: '/api/v1/auth',
      emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        sendResetPassword: async ({ user, url }) => {
          await authService.sendPasswordResetEmail({ email: user.email, url });
        },
      },
      user: {
        additionalFields: {
          role: {
            type: 'string',
            required: false,
            defaultValue: 'USER',
            input: false,
          },
          defaultDelaySeconds: {
            type: 'number',
            required: false,
            defaultValue: 25,
            input: false,
          },
          defaultResumeId: {
            type: 'string',
            required: false,
            input: false,
          },
          defaultTemplateId: {
            type: 'string',
            required: false,
            input: false,
          },
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5,
        },
      },
      advanced: {
        useSecureCookies: true,
        cookiePrefix: 'jobnest',
        defaultCookieAttributes: {
          sameSite: 'none',
          secure: true,
        }
      },
      trustedOrigins: env.CORS_ORIGIN,
    })
  );
}

let authPromise: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  if (!authPromise) {
    authPromise = createAuth();
  }
  return authPromise;
}

export type AuthSession = Awaited<ReturnType<typeof createAuth>>['$Infer']['Session'];
