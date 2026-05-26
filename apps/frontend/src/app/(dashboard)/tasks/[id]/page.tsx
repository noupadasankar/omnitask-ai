'use client';

import { useParams } from 'next/navigation';
import { useTask, useExecuteTask } from '@/hooks/useTasks';
import { ExecutionTimeline } from '@/components/tasks/ExecutionTimeline';
import { AgentStatusPanel } from '@/components/tasks/AgentStatusPanel';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play } from 'lucide-react';
import Link from 'next/link';

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task, isLoading } = useTask(id);
  const executeTask = useExecuteTask();
  const { user } = useAuth();
  const { connected, events } = useSocket(user?.id);

  const latestExecution = task?.executions?.[0];
  const steps = latestExecution?.steps ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!task) {
    return <p className="p-8 text-slate-500">Task not found.</p>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Link href="/tasks" className="text-sm text-emerald-400 hover:underline">
        ← Back to tasks
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{task.title}</h1>
          <p className="text-slate-400 mt-2">{task.naturalLanguage}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{task.status}</Badge>
          {task.status !== 'RUNNING' && task.status !== 'COMPLETED' && (
            <Button
              size="sm"
              onClick={() => executeTask.mutate(id)}
              disabled={executeTask.isPending}
            >
              <Play className="h-4 w-4 mr-1" />
              Execute
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-700 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Execution Timeline</h2>
          <ExecutionTimeline steps={steps} />
        </div>
        <AgentStatusPanel connected={connected} events={events} />
      </div>
    </div>
  );
}
