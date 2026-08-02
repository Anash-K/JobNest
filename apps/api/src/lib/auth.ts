import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';
import { env, isProduction } from '../config/env';
import { authService } from '../services/auth.service';

export const auth = betterAuth({
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
    useSecureCookies: isProduction,
    cookiePrefix: 'jobnest',
  },
  trustedOrigins: env.CORS_ORIGIN,
});

export type AuthSession = typeof auth.$Infer.Session;
