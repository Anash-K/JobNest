'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { gmailApi } from '@/lib/api';

export function useGmailStatus() {
  return useQuery({
    queryKey: queryKeys.gmailStatus,
    queryFn: () => gmailApi.getStatus(),
  });
}

export function useGmailOAuthConfig() {
  return useQuery({
    queryKey: queryKeys.gmailOAuthConfig,
    queryFn: () => gmailApi.getOAuthConfig(),
  });
}
