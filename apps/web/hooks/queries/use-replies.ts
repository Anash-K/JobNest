'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, STALE_TIME } from '@/lib/query-client';
import { repliesApi } from '@/lib/api';

export function useReplies(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.replies(params),
    queryFn: () => repliesApi.list(params),
  });
}

export function useUnreadReplyCount() {
  return useQuery({
    queryKey: queryKeys.repliesUnreadCount,
    queryFn: () => repliesApi.unreadCount(),
    staleTime: STALE_TIME.short,
  });
}

export function useReply(id: string) {
  return useQuery({
    queryKey: queryKeys.reply(id),
    queryFn: () => repliesApi.get(id),
    enabled: Boolean(id),
  });
}

export function useMarkReplyRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => repliesApi.markRead(id),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: ['replies'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reply(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.repliesUnreadCount });
    },
  });
}
