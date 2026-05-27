import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { taskService } from '@/services/task.service';

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],

    queryFn: taskService.getTasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],

    queryFn: () =>
      taskService.getTask(id),

    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn:
      taskService.createTask,

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['tasks'],
      });
    },
  });
}

export function useExecuteTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn:
      taskService.executeTask,

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['tasks'],
      });
    },
  });
}