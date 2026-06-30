'use client';

import {
  Clock3,
  Loader2,
  CheckCircle2,
  XCircle,
  PauseCircle,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TaskStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PAUSED'
  | 'CANCELLED'
  | 'AWAITING_APPROVAL';

interface TaskStatusBadgeProps {
  status: TaskStatus | string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'badge' | 'pill' | 'dot';
  pulse?: boolean;
  className?: string;
}

/* ===========================================================
   STATUS CONFIG MAP
=========================================================== */

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    icon: any;
    color: string;
    bg: string;
    border: string;
    dot: string;
    glow: string;
  }
> = {
  PENDING: {
    label: 'Pending',
    icon: Clock3,
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/20',
    dot: 'bg-zinc-500',
    glow: '',
  },
  QUEUED: {
    label: 'Queued',
    icon: Clock3,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-400',
    glow: 'shadow-yellow-500/20',
  },
  RUNNING: {
    label: 'Running',
    icon: Loader2,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400',
    glow: 'shadow-blue-500/20',
  },
  COMPLETED: {
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
    glow: 'shadow-emerald-500/20',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    dot: 'bg-red-500',
    glow: 'shadow-red-500/20',
  },
  PAUSED: {
    label: 'Paused',
    icon: PauseCircle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    dot: 'bg-orange-400',
    glow: '',
  },
  CANCELLED: {
    label: 'Cancelled',
    icon: XCircle,
    color: 'text-zinc-500',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/20',
    dot: 'bg-zinc-500',
    glow: '',
  },
  AWAITING_APPROVAL: {
    label: 'Awaiting Approval',
    icon: ShieldAlert,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    dot: 'bg-purple-400',
    glow: 'shadow-purple-500/20',
  },
};

/* ===========================================================
   COMPONENT
=========================================================== */

export function TaskStatusBadge({
  status,
  size = 'md',
  variant = 'badge',
  pulse,
  className,
}: TaskStatusBadgeProps) {
  const config = STATUS_CONFIG[status?.toUpperCase()] ?? STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  const isRunning = status?.toUpperCase() === 'RUNNING';

  const sizeStyles = {
    sm: {
      container: 'px-1.5 py-0.5 text-[9px] gap-1',
      icon: 'h-2.5 w-2.5',
      dot: 'h-1.5 w-1.5',
    },
    md: {
      container: 'px-2 py-0.5 text-[10px] gap-1.5',
      icon: 'h-3 w-3',
      dot: 'h-2 w-2',
    },
    lg: {
      container: 'px-3 py-1 text-[11px] gap-2',
      icon: 'h-3.5 w-3.5',
      dot: 'h-2.5 w-2.5',
    },
  };

  const s = sizeStyles[size];

  /* ============ DOT ONLY VARIANT ============ */
  if (variant === 'dot') {
    return (
      <div className={cn('relative flex-shrink-0', className)}>
        <div className={cn('rounded-full', s.dot, config.dot)} />
        {(pulse || isRunning) && (
          <div
            className={cn(
              'absolute inset-0 rounded-full animate-ping opacity-60',
              config.dot,
            )}
          />
        )}
      </div>
    );
  }

  /* ============ PILL VARIANT ============ */
  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-full border font-semibold uppercase tracking-wider',
          s.container,
          config.bg,
          config.border,
          config.color,
          isRunning && 'shadow-sm',
          isRunning && config.glow,
          className,
        )}
      >
        <div className="relative flex items-center">
          <div className={cn('rounded-full', s.dot, config.dot)} />
          {(pulse || isRunning) && (
            <div
              className={cn(
                'absolute inset-0 rounded-full animate-ping opacity-60',
                config.dot,
              )}
            />
          )}
        </div>
        <span>{config.label}</span>
      </div>
    );
  }

  /* ============ DEFAULT BADGE VARIANT ============ */
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-semibold',
        s.container,
        config.bg,
        config.border,
        config.color,
        className,
      )}
    >
      <Icon
        className={cn(
          s.icon,
          isRunning && 'animate-spin',
        )}
      />
      {config.label}
    </span>
  );
}