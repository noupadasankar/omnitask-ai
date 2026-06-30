'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';

import { useTasks } from '@/hooks/useTasks';
import { TaskCard, type TaskCardData } from './TaskCard';
import { cn } from '@/lib/utils';

interface TaskListProps {
  limit?: number;
  variant?: 'compact' | 'full' | 'grid';
  status?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  onTaskAction?: (action: string, task: TaskCardData) => void;
}

/* ===========================================================
   COMPONENT
=========================================================== */

export function TaskList({
  limit,
  variant = 'compact',
  status,
  emptyTitle = 'No Active Executions',
  emptyMessage = 'Launch an autonomous workflow to start execution monitoring.',
  onTaskAction,
}: TaskListProps) {
  const { data: tasks, isLoading, isFetching, refetch } = useTasks();

  // Filter by status if specified
  let list = tasks ?? [];
  if (status) {
    list = list.filter(
      (t: any) => t.status?.toUpperCase() === status.toUpperCase(),
    );
  }
  if (limit) list = list.slice(0, limit);

  /* ============ LOADING SKELETONS ============ */
  if (isLoading) {
    return (
      <div
        className={cn(
          variant === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'
            : 'space-y-2',
        )}
      >
        {Array.from({ length: limit || 5 }).map((_, i) => (
          <TaskSkeleton key={i} variant={variant} delay={i * 0.05} />
        ))}
      </div>
    );
  }

  /* ============ EMPTY STATE ============ */
  if (!list.length) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
        <div className="relative mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <Sparkles className="h-7 w-7 text-zinc-700" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-red-500/20 border border-red-500/30 animate-pulse" />
        </div>

        <h3 className="text-[14px] font-semibold text-white">
          {emptyTitle}
        </h3>
        <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-zinc-500">
          {emptyMessage}
        </p>

        <button
          onClick={() => refetch()}
          className="mt-5 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>
    );
  }

  /* ============ LIST ============ */
  return (
    <div
      className={cn(
        variant === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3'
          : variant === 'compact'
            ? 'space-y-1 p-2'
            : 'space-y-3',
      )}
    >
      <AnimatePresence mode="popLayout">
        {list.map((task: any, i: number) => (
          <motion.div
            key={task.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
          >
            <TaskCard
              task={task as TaskCardData}
              variant={variant === 'compact' ? 'compact' : 'full'}
              onAction={(action, t) => onTaskAction?.(action, t)}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {isFetching && !isLoading && (
        <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-zinc-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          Syncing runtime...
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   SKELETON
=========================================================== */

function TaskSkeleton({
  variant,
  delay,
}: {
  variant: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className={cn(
        'relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.01]',
        variant === 'compact' ? 'h-[58px]' : 'h-[130px]',
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-progress bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
      <div className="p-3 flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-3/4 rounded bg-white/[0.04]" />
          <div className="h-2 w-1/2 rounded bg-white/[0.03]" />
        </div>
        <div className="h-5 w-14 rounded-full bg-white/[0.03]" />
      </div>
    </motion.div>
  );
}