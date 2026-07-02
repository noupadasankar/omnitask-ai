'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Loader2, Pause, XCircle, Play, ArrowRight,
  Search, Activity, Clock,
} from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { useTasks, usePauseTask, useDeleteTask } from '@/hooks/useTasks';

function goalText(task: any): string {
  return task.plan?.goal || task.goal || task.naturalLanguage || `Task ${task.id?.slice(0, 8)}`;
}

export default function RunningTasksPage() {
  const router = useRouter();
  const { data: tasks = [], isLoading, refetch } = useTasks();
  const pauseTask = usePauseTask();
  const deleteTask = useDeleteTask();
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  const runningTasks = useMemo(() => {
    const running = (tasks as any[]).filter((t: any) =>
      t.status === 'RUNNING' || t.status === 'PLANNING'
    );
    return running.filter((t: any) => {
      const matchSearch = !search ||
        goalText(t).toLowerCase().includes(search.toLowerCase()) ||
        t.id?.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [tasks, search]);

  const handlePause = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    pauseTask.mutate(id);
  };

  const handleCancel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteTask.mutate(id);
  };

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            Live
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Running Tasks</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tasks currently executing — auto-refreshes every 5s.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Auto-refreshing
        </div>
      </div>

      {/* Search */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-zinc-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search running tasks…"
          className="h-9 w-56 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none transition-all"
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            <span className="ml-3 text-sm text-zinc-500">Loading tasks…</span>
          </div>
        ) : runningTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20 py-20 text-center">
            <Play className="mb-4 h-10 w-10 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-500">
              {search ? 'No running tasks match your search' : 'No tasks currently running'}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {search ? 'Try a different search term' : 'Create a task from the dashboard to start one'}
            </p>
          </div>
        ) : (
          runningTasks.map((task: any, i: number) => {
            const pct = task.totalSteps > 0
              ? Math.round((task.currentStepIndex / task.totalSteps) * 100)
              : 0;
            const elapsed = task.startedAt
              ? now - new Date(task.startedAt).getTime()
              : 0;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => router.push(`/tasks/${task.id}`)}
                className={cn(
                  'group relative cursor-pointer rounded-2xl border px-5 py-4 transition-all',
                  'border-emerald-500/20 bg-emerald-500/[0.03] hover:border-emerald-500/40 hover:bg-emerald-500/[0.06]',
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Animated status icon */}
                  <div className="relative flex-shrink-0 mt-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
                    </div>
                    <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white group-hover:text-white/90">
                        {goalText(task)}
                      </p>
                      <span className="flex-shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
                        {task.status === 'PLANNING' ? 'PLANNING' : 'RUNNING'}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-600">
                          Step {task.currentStepIndex || 0}/{task.totalSteps || '?'}
                        </span>
                        <span className="font-mono text-emerald-400">{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-progress" />
                        </motion.div>
                      </div>
                    </div>

                    {/* Current step */}
                    {task.currentStep && (
                      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <Activity className="h-3 w-3 text-emerald-400" />
                        {task.currentStep}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(elapsed)}
                      </span>
                      {task.agent && (
                        <span>{task.agent}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      onClick={(e) => handlePause(e, task.id)}
                      disabled={pauseTask.isPending}
                      title="Pause"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 transition-all hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      <Pause className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleCancel(e, task.id)}
                      disabled={deleteTask.isPending}
                      title="Cancel"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                    <ArrowRight className="ml-1 h-4 w-4 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                  </div>
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
