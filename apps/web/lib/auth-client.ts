import { createAuthClient } from 'better-auth/react';

const authBaseUrl =
  process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:4000';

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  basePath: '/api/v1/auth',
  fetchOptions: {
    credentials: 'include',
  },
});

export type AuthSession = typeof authClient.$Infer.Session;

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  changePassword,
  updateUser,
  revokeOtherSessions,
} = authClient;
