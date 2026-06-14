'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, XCircle, Clock, Loader2, PauseCircle,
  RefreshCw, ArrowRight, Search, AlertTriangle, Zap,
  Activity, Ban, HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExecutionHistory } from '@/hooks/useRuntimeData';

/* ── Status meta ─────────────────────────────────────────────────────────── */

const STATUS_META: Record<string, {
  label: string;
  icon: React.ElementType;
  dot: string;
  badge: string;
}> = {
  RUNNING: {
    label: 'Running', icon: Loader2,
    dot: 'bg-emerald-500',
    badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  },
  PLANNING: {
    label: 'Planning', icon: Zap,
    dot: 'bg-blue-500',
    badge: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  },
  PENDING: {
    label: 'Pending', icon: Clock,
    dot: 'bg-zinc-500',
    badge: 'border-zinc-500/20 bg-zinc-800/50 text-zinc-400',
  },
  PAUSED: {
    label: 'Paused', icon: PauseCircle,
    dot: 'bg-amber-500',
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  },
  WAITING_APPROVAL: {
    label: 'Awaiting Approval', icon: HelpCircle,
    dot: 'bg-orange-500 animate-pulse',
    badge: 'border-orange-500/20 bg-orange-500/10 text-orange-400',
  },
  COMPLETED: {
    label: 'Completed', icon: CheckCircle2,
    dot: 'bg-sky-500',
    badge: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
  },
  FAILED: {
    label: 'Failed', icon: XCircle,
    dot: 'bg-red-500',
    badge: 'border-red-500/20 bg-red-500/10 text-red-400',
  },
  CANCELLED: {
    label: 'Cancelled', icon: Ban,
    dot: 'bg-zinc-600',
    badge: 'border-zinc-600/20 bg-zinc-800/30 text-zinc-500',
  },
};

const TABS = [
  { id: 'all',      label: 'All',      filter: null },
  { id: 'active',   label: 'Active',   filter: ['RUNNING', 'PLANNING', 'PAUSED', 'WAITING_APPROVAL'] },
  { id: 'done',     label: 'Completed', filter: ['COMPLETED'] },
  { id: 'failed',   label: 'Failed',   filter: ['FAILED', 'CANCELLED'] },
] as const;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const s = Math.floor((end - start) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  if (diffM < 1) return 'just now';
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function goalText(session: any): string {
  return session.plan?.goal || session.goal || session.naturalLanguage || `Task ${session.id.slice(0, 8)}`;
}

/* ── Stat card ───────────────────────────────────────────────────────────── */

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType;
  color: 'emerald' | 'sky' | 'red' | 'zinc';
}) {
  const text = color === 'emerald' ? 'text-emerald-400' :
               color === 'sky' ? 'text-sky-400' :
               color === 'red' ? 'text-red-400' : 'text-zinc-400';
  const bg   = color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' :
               color === 'sky' ? 'bg-sky-500/10 border-sky-500/20' :
               color === 'red' ? 'bg-red-500/10 border-red-500/20' : 'bg-white/[0.03] border-white/[0.07]';
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border p-4', bg)}>
      <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', bg)}>
        <Icon className={cn('h-4 w-4', text)} />
      </div>
      <div>
        <p className={cn('text-2xl font-black', text)}>{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">{label}</p>
      </div>
    </div>
  );
}

/* ── Session row ─────────────────────────────────────────────────────────── */

function SessionRow({ session, onClick }: { session: any; onClick: () => void }) {
  const meta = STATUS_META[session.status] ?? STATUS_META.PENDING;
  const Icon = meta.icon;
  const isRunning = session.status === 'RUNNING' || session.status === 'PLANNING';
  const pct = session.totalSteps > 0
    ? Math.round((session.currentStepIndex / session.totalSteps) * 100)
    : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex cursor-pointer items-center gap-4 rounded-2xl border px-5 py-4 transition-all hover:border-white/20 hover:bg-white/[0.03]',
        isRunning ? 'border-emerald-500/20 bg-emerald-500/[0.02]' : 'border-white/[0.07] bg-transparent',
      )}
    >
      {/* Status dot */}
      <div className="flex-shrink-0 relative">
        <div className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />
        {isRunning && (
          <div className={cn('absolute inset-0 h-2.5 w-2.5 rounded-full animate-ping opacity-60', meta.dot)} />
        )}
      </div>

      {/* Goal + progress */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate text-sm font-semibold text-white group-hover:text-white/90">
          {goalText(session)}
        </p>

        {session.totalSteps > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  session.status === 'FAILED' ? 'bg-red-500' :
                  session.status === 'COMPLETED' ? 'bg-sky-500' :
                  'bg-emerald-500',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="flex-shrink-0 font-mono text-[9px] text-zinc-600">
              {session.currentStepIndex}/{session.totalSteps}
            </span>
          </div>
        )}

        {session.errorMessage && (
          <p className="flex items-center gap-1 truncate text-[10px] text-red-400/80">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            {session.errorMessage}
          </p>
        )}
      </div>

      {/* Status badge */}
      <div className={cn('flex-shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold', meta.badge)}>
        <Icon className={cn('h-3 w-3', isRunning && 'animate-spin')} />
        {meta.label}
      </div>

      {/* Duration */}
      <div className="w-16 flex-shrink-0 text-right">
        <p className="font-mono text-[11px] text-zinc-400">
          {formatDuration(session.startedAt, session.completedAt)}
        </p>
      </div>

      {/* Date */}
      <div className="w-20 flex-shrink-0 text-right">
        <p className="text-[11px] text-zinc-600">
          {formatDate(session.startedAt ?? session.createdAt)}
        </p>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function TasksPage() {
  const router = useRouter();
  const { data: sessions = [], isLoading, refetch, isFetching } = useExecutionHistory();
  const [tab, setTab] = useState<'all' | 'active' | 'done' | 'failed'>('all');
  const [search, setSearch] = useState('');

  const stats = useMemo(() => ({
    active: sessions.filter((s: any) =>
      ['RUNNING', 'PLANNING', 'PAUSED', 'WAITING_APPROVAL'].includes(s.status)).length,
    completed: sessions.filter((s: any) => s.status === 'COMPLETED').length,
    failed: sessions.filter((s: any) => ['FAILED', 'CANCELLED'].includes(s.status)).length,
    total: sessions.length,
  }), [sessions]);

  const filtered = useMemo(() => {
    const tabDef = TABS.find(t => t.id === tab)!;
    return sessions.filter((s: any) => {
      const matchTab = !tabDef.filter || (tabDef.filter as readonly string[]).includes(s.status);
      const matchSearch = !search ||
        goalText(s).toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [sessions, tab, search]);

  const openSession = (session: any) => {
    // Navigate to dashboard with this session pre-loaded
    router.push(`/dashboard?session=${session.id}`);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <Activity className="h-3.5 w-3.5 text-red-400" />
            Execution Queue
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Task History</h1>
          <p className="mt-1 text-sm text-zinc-500">
            All agent executions — click any row to open the session in the dashboard.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={cn(
            'flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white',
            isFetching && 'opacity-50 cursor-not-allowed',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active"    value={stats.active}    icon={Loader2}      color="emerald" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="sky"     />
        <StatCard label="Failed"    value={stats.failed}    icon={XCircle}      color="red"     />
        <StatCard label="Total"     value={stats.total}     icon={Activity}     color="zinc"    />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
          {TABS.map((t) => {
            const count = t.filter
              ? sessions.filter((s: any) => (t.filter as readonly string[]).includes(s.status)).length
              : sessions.length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  tab === t.id
                    ? 'bg-red-500/10 text-red-400'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {t.label}
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                  tab === t.id ? 'bg-red-500/20 text-red-300' : 'bg-white/[0.04] text-zinc-600',
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="h-9 w-56 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* ── Session list ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-red-400" />
            <span className="ml-3 text-sm text-zinc-500">Loading sessions…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20 py-20 text-center">
            <CheckCircle2 className="mb-4 h-10 w-10 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-500">
              {search ? 'No sessions match your search' : `No ${tab === 'all' ? '' : tab + ' '}sessions yet`}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {search ? 'Try a different search term' : 'Launch a task from the Dashboard to get started'}
            </p>
          </div>
        ) : (
          filtered.map((session: any) => (
            <SessionRow
              key={session.id}
              session={session}
              onClick={() => openSession(session)}
            />
          ))
        )}
      </div>
    </div>
  );
}
