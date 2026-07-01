'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { leadsApi, type ImportLeadRow, type JobLead } from '@/lib/api';

export function useLeads(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.leads(params),
    queryFn: () => leadsApi.list(params),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leadsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useValidateLeadImport() {
  return useMutation({
    mutationFn: (data: { campaignId?: string; leads: ImportLeadRow[] }) =>
      leadsApi.validateImport(data),
  });
}

export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      campaignId?: string;
      skipDuplicates?: boolean;
      leads: ImportLeadRow[];
    }) => leadsApi.import(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export type LeadsQueryResult = Awaited<ReturnType<typeof leadsApi.list>>;

export type { JobLead };
