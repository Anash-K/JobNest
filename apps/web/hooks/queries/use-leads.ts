'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { leadsApi, type ImportLeadRow, type JobLead } from '@/lib/api';

export function useLeads(params?: Record<string, string>, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.leads(params),
    queryFn: () => leadsApi.list(params),
    enabled: options?.enabled,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => leadsApi.get(id),
    enabled: Boolean(id),
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

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<JobLead> }) =>
      leadsApi.update(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['leads', variables.id] });
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
