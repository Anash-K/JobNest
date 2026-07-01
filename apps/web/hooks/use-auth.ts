'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { signOut, useSession } from '@/lib/auth-client';
import { AUTH_ROUTES, DEFAULT_APP_ROUTE } from '@/lib/constants/app';

export function useAuth() {
  const router = useRouter();
  const { data: session, isPending, isRefetching, error, refetch } = useSession();

  const logout = useCallback(async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push(AUTH_ROUTES.login);
          router.refresh();
        },
      },
    });
  }, [router]);

  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isAuthenticated: Boolean(session?.user),
    isLoading: isPending,
    isRefetching,
    error,
    refetch,
    logout,
  };
}

export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();

  if (!auth.isLoading && !auth.isAuthenticated) {
    router.replace(AUTH_ROUTES.login);
  }

  return auth;
}

export function useRedirectIfAuthenticated(redirectTo: string = DEFAULT_APP_ROUTE) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  if (!isLoading && isAuthenticated) {
    router.replace(redirectTo);
  }

  return { isLoading, isAuthenticated };
}
