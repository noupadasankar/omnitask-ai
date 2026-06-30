'use client';

/**
 * @deprecated Use <DashboardHero /> directly.
 * This component is kept for backward compatibility and now wraps DashboardHero
 * so any old imports keep working without breaking the build.
 */

import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { useCreateTask } from '@/hooks/useTasks';

interface TaskCreateFormProps {
  onSuccess?: () => void;
}

export function TaskCreateForm({ onSuccess }: TaskCreateFormProps) {
  const createTask = useCreateTask();

  const handleSubmit = async (data: {
    prompt: string;
    mode: string;
    priority: string;
  }) => {
    try {
      await createTask.mutateAsync({
        naturalLanguage: data.prompt,
        // @ts-ignore - extend your service to accept these
        mode: data.mode,
        priority: data.priority,
      });
      onSuccess?.();
    } catch (e) {
      // toast handled in mutation
    }
  };

  return (
    <DashboardHero
      onSubmit={handleSubmit}
      isLoading={createTask.isPending}
    />
  );
}