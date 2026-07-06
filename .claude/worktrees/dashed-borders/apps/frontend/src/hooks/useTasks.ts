import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

import { taskService } from '@/services/task.service';

/* ===========================================================
   QUERIES
=========================================================== */

export function useTasks(params?: {
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => taskService.getTasks(),
    refetchInterval: 5000, // Auto-refresh every 5s
    refetchOnWindowFocus: true,
    staleTime: 1000,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => taskService.getTask(id),
    enabled: !!id,
    refetchInterval: (query: any) => {
      // Stop polling if the task is done
      const status = query?.state?.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 3000;
    },
  });
}

/* ===========================================================
   MUTATIONS
=========================================================== */

export function useCreateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: taskService.createTask,

    onMutate: async (newTask) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previous = qc.getQueryData(['tasks']);

      qc.setQueryData(['tasks'], (old: any) => {
        const optimistic = {
          id: `temp-${Date.now()}`,
          title: newTask.naturalLanguage?.slice(0, 60),
          naturalLanguage: newTask.naturalLanguage,
          status: 'QUEUED',
          priority: newTask.priority || 'normal',
          createdAt: new Date().toISOString(),
        };
        return Array.isArray(old) ? [optimistic, ...old] : [optimistic];
      });

      return { previous };
    },

    onError: (_err, _new, ctx) => {
      if (ctx?.previous) qc.setQueryData(['tasks'], ctx.previous);
      toast.error('Failed to launch task');
    },

    onSuccess: () => {
      toast.success('Task queued · Agents picking up...');
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useExecuteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: taskService.executeTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function usePauseTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.pauseTask?.(id) ?? Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task paused');
    },
  });
}

export function useResumeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.resumeTask?.(id) ?? Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task resumed');
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.deleteTask?.(id) ?? Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted');
    },
  });
}

export function useRetryTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.retryTask?.(id) ?? Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task retrying...');
    },
  });
}