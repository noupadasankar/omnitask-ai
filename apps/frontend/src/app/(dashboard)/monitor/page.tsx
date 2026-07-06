'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Bot,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PauseCircle,
  Clock,
  Loader2,
  RefreshCw,
  Zap,
  Globe,
  Shield,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMonitorSessions } from '@/hooks/useRuntimeData';

const STATUS_VISUALS: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  RUNNING: { icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Running' },
  PAUSED: { icon: PauseCircle, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Paused' },
  COMPLETED: { icon: CheckCircle2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Completed' },
  FAILED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
  PLANNING: { icon: Cpu, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Planning' },
  ERROR: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Error' },
  WAITING_APPROVAL: { icon: Shield, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Awaiting Approval' },
  IDLE: { icon: Bot, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Idle' },
};

const PROFILE_COLORS: Record<string, string> = {
  conservative: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
  balanced: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
  aggressive: 'text-red-400 border-red-500/20 bg-red-500/10',
};

function statusVisual(status: string) {
  return STATUS_VISUALS[status] || STATUS_VISUALS.IDLE;
}

function formatDuration(startedAt: string | null): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const elapsed = Date.now() - start;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function MonitorPage() {
  const { data, isLoading, isError, refetch, isFetching } = useMonitorSessions();

  const stats = useMemo(() => {
    if (!data?.sessions) return { active: 0, running: 0, paused: 0, failed: 0, completed: 0, total: 0 };
    const s = data.sessions;
    return {
      active: data.active,
      running: s.filter((x: any) => x.status === 'RUNNING').length,
      paused: s.filter((x: any) => x.live?.browserState === 'PAUSED').length,
      failed: s.filter((x: any) => x.status === 'FAILED').length,
      completed: s.filter((x: any) => x.status === 'COMPLETED').length,
      total: s.length,
    };
  }, [data]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Monitor</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live observability of all active agent sessions
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-4 py-2 text-sm text-zinc-300 transition-all hover:border-white/15 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Activity} label="Active Sessions" value={stats.active} color="text-emerald-400" />
        <StatCard icon={Zap} label="Running" value={stats.running} color="text-blue-400" />
        <StatCard icon={PauseCircle} label="Paused" value={stats.paused} color="text-amber-400" />
        <StatCard icon={XCircle} label="Failed" value={stats.failed} color="text-red-400" />
        <StatCard icon={CheckCircle2} label="Completed Today" value={stats.completed} color="text-purple-400" />
      </div>

      {/* Loading / Error / Grid */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-zinc-400">Failed to load monitor data</p>
          <button onClick={() => refetch()} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
            Retry
          </button>
        </div>
      )}

      {data && !isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.sessions.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-3 py-16">
              <Bot className="h-12 w-12 text-zinc-600" />
              <p className="text-sm text-zinc-500">No sessions yet. Launch an agent task to see it here.</p>
            </div>
          )}
          {data.sessions.map((session: any, i: number) => (
            <SessionCard key={session.id} session={session} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, index }: { session: any; index: number }) {
  const s = statusVisual(session.status);
  const isLive = !!session.live;
  const live = session.live || {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/15"
    >
      {/* Top row: status dot + session ID */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn('flex h-2.5 w-2.5 rounded-full', isLive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-zinc-600')} />
          <span className="font-mono text-[11px] text-zinc-500">{session.id.slice(0, 12)}...</span>
        </div>
        <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold', s.bg, s.color)}>
          <s.icon className="h-3 w-3" />
          {isLive ? live.browserState || s.label : s.label}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Metric label="Steps" value={`${session.currentStep ?? '?'} / ${session.totalSteps ?? '?'}`} />
        <Metric label="Duration" value={formatDuration(session.startedAt)} />
        {live.profile && (
          <Metric
            label="Profile"
            value={
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium capitalize', PROFILE_COLORS[live.profile] || 'text-zinc-400')}>
                {live.profile}
              </span>
            }
          />
        )}
        {live.errorCount > 0 && (
          <Metric label="Errors" value={<span className="text-red-400">{live.errorCount}</span>} />
        )}
        {live.routedDomain && (
          <Metric
            label="Domain"
            value={
              <span className="flex items-center gap-1 text-[11px] text-zinc-300">
                <Globe className="h-3 w-3 text-zinc-500" />
                {live.routedDomain}
              </span>
            }
          />
        )}
        {session.errorMessage && (
          <Metric
            label="Error"
            value={<span className="truncate text-[11px] text-red-400">{session.errorMessage}</span>}
          />
        )}
      </div>

      {/* Footer: created time + live indicator */}
      <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
        <span className="flex items-center gap-1 text-[10px] text-zinc-600">
          <Clock className="h-3 w-3" />
          {new Date(session.createdAt).toLocaleTimeString()}
        </span>
        {isLive && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        )}
      </div>
    </motion.div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/15">
      <div className="mb-4 flex items-center justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-600">{label}</p>
      <div className="mt-0.5 text-[13px] font-semibold text-white">{value}</div>
    </div>
  );
}
