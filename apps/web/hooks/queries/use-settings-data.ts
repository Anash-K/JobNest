'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { resumesApi, templatesApi } from '@/lib/api';

export function useResumes() {
  return useQuery({
    queryKey: queryKeys.resumes,
    queryFn: () => resumesApi.list(),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => templatesApi.list(),
  });
}
