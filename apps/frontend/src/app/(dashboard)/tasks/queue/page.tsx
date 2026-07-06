'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Clock, Zap, ArrowRight,
  Search, Loader2, Calendar, ArrowUpDown,
  Trash2,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { useTasks, useDeleteTask } from '@/hooks/useTasks';

function goalText(task: any): string {
  return task.plan?.goal || task.goal || task.naturalLanguage || `Task ${task.id?.slice(0, 8)}`;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  urgent: {
    label: 'Urgent', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20',
  },
  high: {
    label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20',
  },
  normal: {
    label: 'Normal', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
  },
  low: {
    label: 'Low', color: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20',
  },
};

export default function QueuePage() {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasks();
  const deleteTask = useDeleteTask();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'position'>('priority');

  const queuedTasks = useMemo(() => {
    const queued = (tasks as any[]).filter((t: any) =>
      t.status === 'QUEUED' || t.status === 'PLANNING' || t.status === 'PENDING'
    );
    const filtered = queued.filter((t: any) => {
      const matchSearch = !search ||
        goalText(t).toLowerCase().includes(search.toLowerCase()) ||
        t.id?.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });

    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    return [...filtered].sort((a: any, b: any) => {
      if (sortBy === 'priority') {
        const pa = priorityOrder[String(a.priority || 'normal')] ?? 2;
        const pb = priorityOrder[String(b.priority || 'normal')] ?? 2;
        if (pa !== pb) return pa - pb;
      }
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  }, [tasks, search, sortBy]);

  const handleCancel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteTask.mutate(id);
  };

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          Queue
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Task Queue</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tasks waiting to be picked up by agents — {queuedTasks.length} queued.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queued tasks…"
            className="h-9 w-56 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-amber-500/30 focus:outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
          <button
            onClick={() => setSortBy('priority')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              sortBy === 'priority' ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Zap className="h-3 w-3" />
            Priority
          </button>
          <button
            onClick={() => setSortBy('position')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              sortBy === 'position' ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <ArrowUpDown className="h-3 w-3" />
            Position
          </button>
        </div>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl">
          <p className="text-2xl font-black text-amber-400">{queuedTasks.length}</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Queued</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl">
          <p className="text-2xl font-black text-red-400">
            {queuedTasks.filter((t: any) => t.priority === 'urgent' || t.priority === 'high').length}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">High Priority</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl">
          <p className="text-2xl font-black text-zinc-400">
            {queuedTasks.filter((t: any) => t.priority === 'low' || !t.priority).length}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Low Priority</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <span className="ml-3 text-sm text-zinc-500">Loading queue…</span>
          </div>
        ) : queuedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20 py-20 text-center">
            <Clock className="mb-4 h-10 w-10 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-500">
              {search ? 'No queued tasks match your search' : 'Queue is empty'}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {search ? 'Try a different search term' : 'Tasks will appear here when agents are busy'}
            </p>
          </div>
        ) : (
          queuedTasks.map((task: any, i: number) => {
            const priority = task.priority || 'normal';
            const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.normal;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => router.push(`/tasks/${task.id}`)}
                className="group relative flex cursor-pointer items-center gap-4 rounded-2xl border border-white/[0.07] px-5 py-4 transition-all hover:border-white/20 hover:bg-white/[0.03]"
              >
                {/* Queue position */}
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.03] text-xs font-mono text-zinc-600">
                  #{i + 1}
                </div>

                {/* Priority indicator bar */}
                <div className={cn(
                  'h-10 w-0.5 flex-shrink-0 rounded-full',
                  priority === 'urgent' ? 'bg-red-500' :
                  priority === 'high' ? 'bg-orange-500' :
                  priority === 'low' ? 'bg-zinc-600' : 'bg-blue-500',
                )} />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white group-hover:text-white/90">
                      {goalText(task)}
                    </p>
                    <span className={cn(
                      'flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                      config.bg, config.border, config.color,
                    )}>
                      {config.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {timeAgo(task.createdAt)}
                    </span>
                    {task.estimatedStartAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Est. {timeAgo(task.estimatedStartAt)}
                      </span>
                    )}
                    <span className="capitalize">{task.status?.toLowerCase()}</span>
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button
                    onClick={(e) => handleCancel(e, task.id)}
                    disabled={deleteTask.isPending}
                    title="Remove from queue"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ArrowRight className="h-4 w-4 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
