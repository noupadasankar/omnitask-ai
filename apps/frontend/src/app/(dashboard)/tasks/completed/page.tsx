'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Clock, Search, Calendar, BarChart3,
  ArrowRight, Loader2, Activity,
} from 'lucide-react';
import { cn, formatDuration, timeAgo } from '@/lib/utils';
import { useTasks } from '@/hooks/useTasks';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function goalText(task: any): string {
  return task.plan?.goal || task.goal || task.naturalLanguage || `Task ${task.id?.slice(0, 8)}`;
}

export default function CompletedTasksPage() {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasks();
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const completedTasks = useMemo(() => {
    const completed = (tasks as any[]).filter((t: any) => t.status === 'COMPLETED');

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return completed.filter((t: any) => {
      const matchSearch = !search ||
        goalText(t).toLowerCase().includes(search.toLowerCase()) ||
        t.id?.toLowerCase().includes(search.toLowerCase());

      let matchDate = true;
      const completedAt = t.completedAt ? new Date(t.completedAt) : null;
      if (dateFilter === 'today' && completedAt) matchDate = completedAt >= dayStart;
      else if (dateFilter === 'week' && completedAt) matchDate = completedAt >= weekStart;
      else if (dateFilter === 'month' && completedAt) matchDate = completedAt >= monthStart;

      return matchSearch && matchDate;
    });
  }, [tasks, search, dateFilter]);

  const summary = useMemo(() => {
    const total = completedTasks.length;
    const durations = completedTasks
      .map((t: any) => t.startedAt && t.completedAt
        ? new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime()
        : null)
      .filter(Boolean) as number[];
    const avgDuration = durations.length > 0
      ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
      : 0;
    const totalSteps = completedTasks.reduce((sum: number, t: any) => sum + (t.totalSteps || 0), 0);
    return { total, avgDuration, totalSteps };
  }, [completedTasks]);

  const DATE_FILTERS = [
    { id: 'all' as const, label: 'All Time' },
    { id: 'today' as const, label: 'Today' },
    { id: 'week' as const, label: 'This Week' },
    { id: 'month' as const, label: 'This Month' },
  ];

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          Completed
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Completed Tasks</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tasks that finished successfully — review results and durations.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-emerald-400">{summary.total}</p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Completed</p>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20">
              <Clock className="h-4 w-4 text-sky-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-sky-400">{summary.total > 0 ? formatDuration(summary.avgDuration) : '—'}</p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Avg Duration</p>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-indigo-400">{summary.totalSteps}</p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Total Steps</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                dateFilter === f.id
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search completed tasks…"
            className="h-9 w-56 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            <span className="ml-3 text-sm text-zinc-500">Loading tasks…</span>
          </div>
        ) : completedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20 py-20 text-center">
            <CheckCircle2 className="mb-4 h-10 w-10 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-500">
              {search ? 'No completed tasks match your search' : 'No completed tasks yet'}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {search ? 'Try a different search term' : 'Tasks will appear here once they finish successfully'}
            </p>
          </div>
        ) : (
          completedTasks.map((task: any, i: number) => {
            const startedAt = task.startedAt ? new Date(task.startedAt) : null;
            const completedAt = task.completedAt ? new Date(task.completedAt) : null;
            const duration = startedAt && completedAt ? completedAt.getTime() - startedAt.getTime() : null;
            const steps = task.totalSteps || 0;
            const pct = steps > 0 ? 100 : 0;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => router.push(`/tasks/${task.id}`)}
                className="group relative flex cursor-pointer items-center gap-4 rounded-2xl border border-white/[0.07] px-5 py-4 transition-all hover:border-white/20 hover:bg-white/[0.03]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="truncate text-sm font-semibold text-white group-hover:text-white/90">
                    {goalText(task)}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                    {completedAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(task.completedAt)}
                      </span>
                    )}
                    {duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(duration)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {steps} step{steps !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {steps > 0 && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="font-mono text-[10px] text-zinc-600">{timeAgo(task.completedAt)}</p>
                </div>

                <ArrowRight className="h-4 w-4 flex-shrink-0 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
              </motion.div>
            );
          })
        )}
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
