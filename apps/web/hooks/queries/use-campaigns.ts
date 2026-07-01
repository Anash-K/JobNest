'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { campaignsApi, type Campaign } from '@/lib/api';

export function useCampaigns(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.campaigns(params),
    queryFn: () => campaignsApi.list(params),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: (campaign) => {
      queryClient.setQueryData<Campaign[]>(queryKeys.campaigns(), (current) =>
        current ? [campaign, ...current] : [campaign],
      );
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
