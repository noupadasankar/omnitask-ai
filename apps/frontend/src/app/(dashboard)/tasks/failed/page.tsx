'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  XCircle, RotateCcw, Search, AlertTriangle, CheckCircle2,
  ArrowRight, Loader2, TrendingUp,
} from 'lucide-react';
import { cn, timeAgo, formatDuration } from '@/lib/utils';
import { useTasks, useRetryTask } from '@/hooks/useTasks';

function goalText(task: any): string {
  return task.plan?.goal || task.goal || task.naturalLanguage || `Task ${task.id?.slice(0, 8)}`;
}

const COMMON_ERROR_KEYWORDS: [RegExp, string][] = [
  [/timeout|timed ?out/i, 'Timeout'],
  [/permission|denied|forbidden|unauthorized|auth/i, 'Permission Denied'],
  [/not ?found|404/i, 'Not Found'],
  [/network|connection refused|econnrefused|enotfound/i, 'Network Error'],
  [/rate ?limit|too many requests|429/i, 'Rate Limited'],
  [/invalid|validation/i, 'Invalid Input'],
  [/internal server|500/i, 'Server Error'],
];

function categorizeError(msg: string): string {
  for (const [regex, label] of COMMON_ERROR_KEYWORDS) {
    if (regex.test(msg)) return label;
  }
  return 'Other';
}

export default function FailedTasksPage() {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasks();
  const retryTask = useRetryTask();
  const [search, setSearch] = useState('');
  const [errorFilter, setErrorFilter] = useState<string | null>(null);

  const failedTasks = useMemo(() => {
    const failed = (tasks as any[]).filter((t: any) =>
      t.status === 'FAILED' || t.status === 'CANCELLED'
    );
    return failed.filter((t: any) => {
      const matchSearch = !search ||
        goalText(t).toLowerCase().includes(search.toLowerCase()) ||
        t.id?.toLowerCase().includes(search.toLowerCase()) ||
        (t.errorMessage || '').toLowerCase().includes(search.toLowerCase());
      const matchError = !errorFilter || categorizeError(t.errorMessage || '') === errorFilter;
      return matchSearch && matchError;
    });
  }, [tasks, search, errorFilter]);

  const summary = useMemo(() => {
    const total = (tasks as any[]).length;
    const failed = failedTasks.length;
    const rate = total > 0 ? Math.round((failed / total) * 100) : 0;

    const errorCounts = new Map<string, number>();
    failedTasks.forEach((t: any) => {
      const cat = categorizeError(t.errorMessage || '');
      errorCounts.set(cat, (errorCounts.get(cat) || 0) + 1);
    });
    const commonErrors = [...errorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { total: failed, rate, commonErrors };
  }, [tasks, failedTasks]);

  const handleRetry = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    retryTask.mutate(id);
  };

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <XCircle className="h-3.5 w-3.5 text-red-400" />
          Failed
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Failed Tasks</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tasks that encountered errors — review, retry, or investigate.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
              <XCircle className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-red-400">{summary.total}</p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Failed</p>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
              <TrendingUp className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-black text-red-400">{summary.rate}%</p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Failure Rate</p>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-orange-400 truncate">
                {summary.commonErrors[0]?.[0] || 'N/A'}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Most Common Error</p>
            </div>
          </div>
        </div>
      </div>

      {/* Common Errors Breakdown */}
      {summary.commonErrors.length > 0 && (
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Error Breakdown</h3>
          <div className="space-y-2">
            {summary.commonErrors.map(([error, count]) => (
              <button
                key={error}
                onClick={() => setErrorFilter(errorFilter === error ? null : error)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-4 py-2.5 transition-all',
                  errorFilter === error
                    ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04]',
                )}
              >
                <span className={cn(
                  'text-sm font-medium',
                  errorFilter === error ? 'text-red-300' : 'text-zinc-400',
                )}>
                  {error}
                </span>
                <span className="font-mono text-xs text-zinc-500">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center justify-between">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search failed tasks…"
            className="h-9 w-56 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none transition-all"
          />
        </div>
        {errorFilter && (
          <button
            onClick={() => setErrorFilter(null)}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-all"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-red-400" />
            <span className="ml-3 text-sm text-zinc-500">Loading tasks…</span>
          </div>
        ) : failedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20 py-20 text-center">
            <CheckCircle2 className="mb-4 h-10 w-10 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-500">
              {search ? 'No failed tasks match your search' : 'No failed tasks'}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {search ? 'Try a different search term' : 'All tasks are running smoothly'}
            </p>
          </div>
        ) : (
          failedTasks.map((task: any, i: number) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => router.push(`/tasks/${task.id}`)}
              className="group relative flex cursor-pointer items-center gap-4 rounded-2xl border border-red-500/10 px-5 py-4 transition-all hover:border-red-500/30 hover:bg-red-500/[0.02]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-sm font-semibold text-white group-hover:text-white/90">
                  {goalText(task)}
                </p>
                {task.errorMessage && (
                  <p className="flex items-center gap-1 truncate text-[11px] text-red-400/80">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    {task.errorMessage}
                  </p>
                )}
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  {task.failedAt && (
                    <span>{timeAgo(task.failedAt)}</span>
                  )}
                  {task.completedAt && !task.failedAt && (
                    <span>{timeAgo(task.completedAt)}</span>
                  )}
                  {task.duration && (
                    <span>· {formatDuration(task.duration)}</span>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => handleRetry(e, task.id)}
                disabled={retryTask.isPending}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
              >
                {retryTask.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Retry
              </button>

              <ArrowRight className="h-4 w-4 flex-shrink-0 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
            </motion.div>
          ))
        )}
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
