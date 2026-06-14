'use client';

import React, { useMemo } from 'react';
import { Bot, Building2, CheckCircle2, SkipForward, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveApplication, JobAgentPhase } from '@/hooks/useJobAgentSession';

interface JobAgentStatusProps {
  phase: JobAgentPhase;
  applications: LiveApplication[];
  /** Target from the launch form — the denominator for "43 / 100". */
  target: number;
}

/**
 * Agent-specific runtime card (the "JOB AGENT" panel). Derived entirely from the
 * live `application:result` stream the agent already emits — no extra events.
 *
 *   • Current     = the job currently at the approval gate (PENDING_APPROVAL)
 *   • Portal      = that job's portal (or the most recent row's)
 *   • Applied     = rows that reached APPLIED
 *   • Skipped     = rows SKIPPED (low score / approval denied)
 *   • Progress    = applied / target
 */
export function JobAgentStatus({ phase, applications, target }: JobAgentStatusProps) {
  const stats = useMemo(() => {
    const applied = applications.filter((a) => a.status === 'APPLIED').length;
    const skipped = applications.filter((a) => a.status === 'SKIPPED').length;
    const failed = applications.filter((a) => a.status === 'FAILED').length;
    const pending = applications.find((a) => a.status === 'PENDING_APPROVAL');
    const latest = applications[applications.length - 1];
    const current = pending ?? latest;
    return { applied, skipped, failed, current, pending };
  }, [applications]);

  const running = phase === 'planning' || phase === 'executing';
  const denom = Math.max(target, stats.applied);
  const pct = denom > 0 ? Math.min(100, Math.round((stats.applied / denom) * 100)) : 0;

  const statusLabel =
    phase === 'completed'
      ? 'Run complete'
      : phase === 'failed'
        ? 'Run failed'
        : stats.pending
          ? 'Awaiting approval…'
          : running
            ? 'Applying…'
            : 'Idle';

  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/40 p-5 backdrop-blur-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl border',
            running
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-white/10 bg-white/[0.02] text-zinc-500',
          )}
        >
          <Bot className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            Runtime
          </div>
          <div className="text-sm font-bold text-white">Job Agent</div>
        </div>
        <span
          className={cn(
            'ml-auto flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider',
            running
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : phase === 'failed'
                ? 'border-red-500/20 bg-red-500/10 text-red-400'
                : 'border-white/10 bg-white/[0.02] text-zinc-500',
          )}
        >
          <Activity className={cn('h-2.5 w-2.5', running && 'animate-pulse')} />
          {statusLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-[11px] font-mono">
          <span className="text-zinc-500">Progress</span>
          <span className="text-zinc-300">
            {stats.applied} / {target}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Counters */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Counter icon={CheckCircle2} label="Applied" value={stats.applied} tone="emerald" />
        <Counter icon={SkipForward} label="Skipped" value={stats.skipped} tone="zinc" />
        <Counter icon={Building2} label="Failed" value={stats.failed} tone="red" />
      </div>

      {/* Current job */}
      <div className="rounded-xl border border-white/5 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          Current
        </div>
        {stats.current ? (
          <>
            <div className="mt-1 truncate text-sm font-medium text-zinc-100">
              {stats.current.title || '—'}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="truncate">{stats.current.company || 'Unknown company'}</span>
              {stats.current.portal && (
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono capitalize text-zinc-400">
                  {stats.current.portal}
                </span>
              )}
              {typeof stats.current.score === 'number' && (
                <span className="ml-auto font-mono text-zinc-400">{stats.current.score}</span>
              )}
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-zinc-600">No active job</div>
        )}
      </div>
    </div>
  );
}

function Counter({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: 'emerald' | 'zinc' | 'red';
}) {
  const toneCls =
    tone === 'emerald'
      ? 'text-emerald-400'
      : tone === 'red'
        ? 'text-red-400'
        : 'text-zinc-300';
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 p-2.5 text-center">
      <Icon className={cn('mx-auto mb-1 h-3.5 w-3.5', toneCls)} />
      <div className={cn('text-base font-bold', toneCls)}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}
