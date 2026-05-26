'use client';

import Link from 'next/link';
import { useTasks } from '@/hooks/useTasks';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  QUEUED: 'bg-slate-600',
  PLANNING: 'bg-blue-600',
  RUNNING: 'bg-amber-600',
  COMPLETED: 'bg-emerald-600',
  FAILED: 'bg-red-600',
  CANCELLED: 'bg-slate-700',
};

export function TaskList({ limit }: { limit?: number }) {
  const { data: tasks, isLoading } = useTasks();
  const list = limit ? tasks?.slice(0, limit) : tasks;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!list?.length) {
    return <p className="text-slate-500 text-sm py-8 text-center">No tasks yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-800">
      {list.map((task) => (
        <li key={task.id}>
          <Link
            href={`/tasks/${task.id}`}
            className="block px-4 py-3 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-white truncate">{task.title}</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {task.naturalLanguage}
                </p>
              </div>
              <Badge className={cn('shrink-0', statusColors[task.status] ?? 'bg-slate-600')}>
                {task.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {new Date(task.createdAt).toLocaleString()}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
