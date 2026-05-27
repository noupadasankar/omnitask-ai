'use client';

import Link from 'next/link';

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Loader2,
  PlayCircle,
  Sparkles,
} from 'lucide-react';

import { motion } from 'framer-motion';

import { useTasks } from '@/hooks/useTasks';

const statusConfig: Record<
  string,
  {
    icon: any;
    color: string;
    bg: string;
    pulse?: boolean;
  }
> = {
  QUEUED: {
    icon: Clock3,
    color: 'text-zinc-300',
    bg: 'bg-zinc-500/10 border-zinc-500/20',
  },

  PLANNING: {
    icon: BrainCircuit,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    pulse: true,
  },

  RUNNING: {
    icon: PlayCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    pulse: true,
  },

  COMPLETED: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },

  FAILED: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
  },

  CANCELLED: {
    icon: AlertTriangle,
    color: 'text-zinc-500',
    bg: 'bg-zinc-500/10 border-zinc-500/20',
  },
};

export function TaskList({
  limit,
}: {
  limit?: number;
}) {
  const { data: tasks, isLoading } =
    useTasks();

  const list = limit
    ? tasks?.slice(0, limit)
    : tasks;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-red-400" />

          <p className="text-sm text-zinc-500">
            Connecting to execution runtime...
          </p>
        </div>
      </div>
    );
  }

  if (!list?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]">
          <Sparkles className="h-10 w-10 text-zinc-600" />
        </div>

        <h3 className="text-lg font-semibold text-white">
          No Active Executions
        </h3>

        <p className="mt-2 max-w-sm text-sm text-zinc-500">
          Launch an autonomous workflow to start
          execution monitoring and runtime tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((task, index) => {
        const config =
          statusConfig[task.status] ??
          statusConfig.QUEUED;

        const Icon = config.icon;

        return (
          <motion.div
            key={task.id}
            initial={{
              opacity: 0,
              y: 12,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              delay: index * 0.03,
            }}
          >
            <Link
              href={`/tasks/${task.id}`}
              className="
                group
                relative
                block
                overflow-hidden
                rounded-[26px]
                border
                border-white/10
                bg-white/[0.03]
                p-5
                transition-all
                duration-300
                hover:border-red-500/20
                hover:bg-red-500/[0.03]
              "
            >
              {/* GLOW */}
              <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-red-500/0 blur-3xl transition-all duration-500 group-hover:bg-red-500/10" />

              {/* TOP */}
              <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                {/* LEFT */}
                <div className="min-w-0 flex-1">
                  {/* TITLE */}
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className={`
                        flex h-11 w-11 items-center justify-center rounded-2xl border
                        ${config.bg}
                      `}
                    >
                      <Icon
                        className={`
                          h-5 w-5
                          ${config.color}
                          ${
                            config.pulse
                              ? 'animate-pulse'
                              : ''
                          }
                        `}
                      />
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-white">
                        {task.title}
                      </h3>

                      <p className="text-xs text-zinc-500">
                        Task ID • {task.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  {/* DESCRIPTION */}
                  <p className="line-clamp-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
                    {task.naturalLanguage}
                  </p>

                  {/* BOTTOM */}
                  <div className="mt-5 flex flex-wrap items-center gap-4">
                    <RuntimeBadge
                      label="PlannerAgent"
                    />

                    <RuntimeBadge
                      label="BrowserAgent"
                    />

                    <RuntimeBadge
                      label="Execution Graph"
                    />

                    <span className="text-xs text-zinc-600">
                      {new Date(
                        task.createdAt,
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* RIGHT */}
                <div className="flex flex-col items-start gap-3 xl:items-end">
                  <div
                    className={`
                      flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-wide
                      ${config.bg}
                      ${config.color}
                    `}
                  >
                    <div
                      className={`
                        h-2 w-2 rounded-full
                        ${
                          config.pulse
                            ? 'animate-pulse bg-current'
                            : 'bg-current'
                        }
                      `}
                    />

                    {task.status}
                  </div>

                  {/* PROGRESS */}
                  <div className="w-44">
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                      <span>Execution</span>

                      <span>
                        {getProgress(
                          task.status,
                        )}
                        %
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`
                          h-full rounded-full transition-all duration-700
                          ${getProgressColor(
                            task.status,
                          )}
                        `}
                        style={{
                          width: `${getProgress(
                            task.status,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ===================================================== */
/* HELPERS */
/* ===================================================== */

function RuntimeBadge({
  label,
}: {
  label: string;
}) {
  return (
    <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-zinc-400">
      {label}
    </div>
  );
}

function getProgress(status: string) {
  switch (status) {
    case 'QUEUED':
      return 15;

    case 'PLANNING':
      return 35;

    case 'RUNNING':
      return 72;

    case 'COMPLETED':
      return 100;

    case 'FAILED':
      return 100;

    case 'CANCELLED':
      return 0;

    default:
      return 10;
  }
}

function getProgressColor(status: string) {
  switch (status) {
    case 'QUEUED':
      return 'bg-zinc-500';

    case 'PLANNING':
      return 'bg-blue-500';

    case 'RUNNING':
      return 'bg-amber-500 animate-pulse';

    case 'COMPLETED':
      return 'bg-emerald-500';

    case 'FAILED':
      return 'bg-red-500';

    default:
      return 'bg-zinc-500';
  }
}