'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Clock,
  Bot,
  MoreVertical,
  PlayCircle,
  PauseCircle,
  Trash2,
  Eye,
  Zap,
  ArrowUpRight,
} from 'lucide-react';

import { TaskStatusBadge, type TaskStatus } from './TaskStatusBadge';
import { cn, formatDate, truncate } from '@/lib/utils';

/* ===========================================================
   TYPES
=========================================================== */

export interface TaskCardData {
  id: string;
  title?: string;
  naturalLanguage?: string;
  status: TaskStatus | string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  progress?: number;
  agent?: string;
  agents?: string[];
  duration?: string;
  createdAt?: string | Date;
  startedAt?: string | Date;
  finishedAt?: string | Date;
}

interface TaskCardProps {
  task: TaskCardData;
  variant?: 'compact' | 'full';
  onAction?: (action: 'view' | 'pause' | 'resume' | 'delete', task: TaskCardData) => void;
}

/* ===========================================================
   PRIORITY BAR
=========================================================== */

const PRIORITY_BAR: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  normal: 'bg-blue-400',
  low: 'bg-zinc-600',
};

/* ===========================================================
   COMPONENT
=========================================================== */

export function TaskCard({
  task,
  variant = 'full',
  onAction,
}: TaskCardProps) {
  const isRunning = task.status?.toString().toUpperCase() === 'RUNNING';
  const isFailed = task.status?.toString().toUpperCase() === 'FAILED';
  const title = task.title || task.naturalLanguage || 'Untitled Task';

  /* ============ COMPACT VARIANT ============ */
  if (variant === 'compact') {
    return (
      <Link href={`/tasks/${task.id}`}>
        <motion.div
          whileHover={{ x: 2 }}
          className={cn(
            'group relative flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition-all duration-200',
            'hover:border-white/15 hover:bg-white/[0.04]',
            isRunning && 'border-blue-500/15',
            isFailed && 'border-red-500/15',
          )}
        >
          {/* Priority left bar */}
          {task.priority && (
            <div
              className={cn(
                'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full',
                PRIORITY_BAR[task.priority],
              )}
            />
          )}

          <TaskStatusBadge
            status={task.status}
            variant="dot"
            size="md"
            pulse={isRunning}
          />

          <div className="flex-1 min-w-0">
            <p className="truncate text-[13px] font-medium text-zinc-200">
              {truncate(title, 60)}
            </p>
            <div className="mt-0.5 flex items-center gap-3 text-[10px] text-zinc-600">
              {task.agent && (
                <span className="flex items-center gap-1">
                  <Bot className="h-2.5 w-2.5" />
                  {task.agent}
                </span>
              )}
              {task.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {task.duration}
                </span>
              )}
            </div>
          </div>

          <TaskStatusBadge status={task.status} size="sm" />

          <ArrowUpRight className="h-4 w-4 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100" />
        </motion.div>
      </Link>
    );
  }

  /* ============ FULL VARIANT ============ */
  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-black/30 backdrop-blur-xl',
        'transition-all duration-300',
        isRunning
          ? 'border-blue-500/20 hover:border-blue-500/40 shadow-lg shadow-blue-500/5'
          : isFailed
            ? 'border-red-500/20 hover:border-red-500/40'
            : 'border-white/[0.07] hover:border-white/15',
      )}
    >
      {/* RUNNING - top scan line */}
      {isRunning && (
        <div className="absolute top-0 left-0 right-0 h-[1px] overflow-hidden">
          <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-progress" />
        </div>
      )}

      {/* Priority side bar */}
      {task.priority && (
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-[3px]',
            PRIORITY_BAR[task.priority],
          )}
        />
      )}

      <div className="p-4 pl-5">

        {/* ===== Top: Status + Actions ===== */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <TaskStatusBadge status={task.status} size="md" />
            {task.priority && task.priority !== 'normal' && (
              <span
                className={cn(
                  'text-[9px] font-bold uppercase tracking-widest',
                  task.priority === 'critical' && 'text-red-400',
                  task.priority === 'high' && 'text-orange-400',
                  task.priority === 'low' && 'text-zinc-600',
                )}
              >
                {task.priority}
              </span>
            )}
          </div>

          {/* Hover Actions */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.preventDefault();
                onAction?.('view', task);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              title="View"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>

            {isRunning ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onAction?.('pause', task);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-orange-500/10 hover:text-orange-400"
                title="Pause"
              >
                <PauseCircle className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onAction?.('resume', task);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400"
                title="Resume"
              >
                <PlayCircle className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.preventDefault();
                onAction?.('delete', task);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            <button className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white">
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ===== Title ===== */}
        <Link href={`/tasks/${task.id}`} className="block">
          <h3 className="text-[14px] font-semibold leading-snug text-white line-clamp-2 group-hover:text-red-400 transition-colors">
            {title}
          </h3>
        </Link>

        {/* ===== Progress Bar (if running) ===== */}
        {isRunning && typeof task.progress === 'number' && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-zinc-500">Progress</span>
              <span className="text-[10px] font-mono font-semibold text-blue-400">
                {task.progress}%
              </span>
            </div>
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${task.progress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
              />
              {/* Shimmer */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-progress" />
            </div>
          </div>
        )}

        {/* ===== Footer: Agents + Meta ===== */}
        <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-3">
          {/* Agent stack */}
          <div className="flex items-center gap-2">
            {task.agents && task.agents.length > 0 ? (
              <>
                <div className="flex -space-x-1.5">
                  {task.agents.slice(0, 3).map((agent, i) => (
                    <div
                      key={agent}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-black bg-white/[0.06] ring-1 ring-white/10"
                      title={agent}
                    >
                      <Bot className="h-2.5 w-2.5 text-zinc-400" />
                    </div>
                  ))}
                </div>
                {task.agents.length > 3 && (
                  <span className="text-[9px] text-zinc-600">
                    +{task.agents.length - 3}
                  </span>
                )}
              </>
            ) : task.agent ? (
              <div className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5">
                <Bot className="h-2.5 w-2.5 text-zinc-500" />
                <span className="text-[10px] text-zinc-400">{task.agent}</span>
              </div>
            ) : (
              <span className="text-[10px] text-zinc-700">No agents</span>
            )}
          </div>

          {/* Duration / Time */}
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            {task.duration && (
              <span className="flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                {task.duration}
              </span>
            )}
            {task.createdAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatDate(task.createdAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}