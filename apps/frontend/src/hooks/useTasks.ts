'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';

export interface Task {
  id: string;
  title: string;
  naturalLanguage: string;
  status: string;
  createdAt: string;
  plan?: { id: string; validated: boolean };
  executions?: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt?: string;
  }>;
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data } = await tasksApi.list();
      return data as Task[];
    },
    refetchInterval: 5000,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const { data } = await tasksApi.get(id);
      return data as Task & {
        executions: Array<{
          id: string;
          status: string;
          steps: Array<{
            stepIndex: number;
            stepType: string;
            action: string;
            status: string;
            output?: unknown;
            errorMessage?: string;
          }>;
        }>;
      };
    },
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ naturalLanguage, title }: { naturalLanguage: string; title?: string }) =>
      tasksApi.create(naturalLanguage, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useExecuteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.execute(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks', id] });
    },
  });
}
