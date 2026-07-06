'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Search,
  ArrowUpRight,
  RefreshCw,
  Loader2,
  Cpu,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useExecutionHistory } from '@/hooks/useRuntimeData';
import { formatDate, formatDuration } from '@/lib/utils';

interface Session {
  id: string;
  taskId: string;
  status:
    | 'PENDING'
    | 'PLANNING'
    | 'RUNNING'
    | 'PAUSED'
    | 'WAITING_APPROVAL'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED';
  totalSteps: number;
  currentStepIndex: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const STATUS_KEYS: Session['status'][] = [
  'COMPLETED',
  'FAILED',
  'RUNNING',
  'CANCELLED',
  'PAUSED',
  'PENDING',
];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500 text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
  RUNNING: 'bg-blue-500 text-blue-400 border-blue-500/20 bg-blue-500/10',
  FAILED: 'bg-red-500 text-red-400 border-red-500/20 bg-red-500/10',
  CANCELLED: 'bg-zinc-500 text-zinc-400 border-zinc-500/20 bg-zinc-500/10',
  PAUSED: 'bg-amber-500 text-amber-400 border-amber-500/20 bg-amber-500/10',
  PENDING: 'bg-purple-500 text-purple-400 border-purple-500/20 bg-purple-500/10',
  PLANNING: 'bg-purple-500 text-purple-400 border-purple-500/20 bg-purple-500/10',
  WAITING_APPROVAL: 'bg-yellow-500 text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
};

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

export default function ExecutionHistoryPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [statusFilter, setStatusFilter] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useExecutionHistory();
  const sessions: Session[] = useMemo(() => {
    return Array.isArray(data) ? data : [];
  }, [data]);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - RANGE_DAYS[timeRange] * 86400 * 1000;
    return sessions.filter((s) => {
      if (new Date(s.createdAt).getTime() < cutoff) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (searchQuery && !s.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [sessions, timeRange, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((s) => s.status === 'COMPLETED').length;
    const failed = filtered.filter((s) => s.status === 'FAILED').length;
    const running = filtered.filter((s) => s.status === 'RUNNING').length;
    const terminal = filtered.filter((s) =>
      ['COMPLETED', 'FAILED', 'CANCELLED'].includes(s.status),
    );
    const successRate = terminal.length
      ? (completed / terminal.length) * 100
      : 0;

    const durations = filtered
      .filter((s) => s.startedAt && s.completedAt)
      .map(
        (s) =>
          (new Date(s.completedAt!).getTime() -
            new Date(s.startedAt!).getTime()),
      )
      .filter((d) => d >= 0);
    const avgDuration = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const totalSteps = filtered.reduce((s, session) => s + session.totalSteps, 0);

    return { total, completed, failed, running, successRate, avgDuration, totalSteps };
  }, [filtered]);

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Execution History</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Detailed view of all agent execution sessions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={PlayCircle} label="Total Executions" value={String(stats.total)} sub="sessions in range" color="text-blue-400" />
        <StatCard icon={CheckCircle2} label="Completed" value={String(stats.completed)} sub={`${stats.total ? ((stats.completed / stats.total) * 100).toFixed(0) : 0}% of total`} color="text-emerald-400" />
        <StatCard icon={AlertTriangle} label="Failed" value={String(stats.failed)} sub={`${stats.total ? ((stats.failed / stats.total) * 100).toFixed(0) : 0}% failure rate`} color="text-red-400" />
        <StatCard icon={Clock} label="Avg Duration" value={stats.avgDuration ? formatDuration(stats.avgDuration) : '—'} sub={`${stats.totalSteps} total steps`} color="text-purple-400" />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                timeRange === range ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {range === '7d' ? '7 days' : range === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Search by session ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-xl border border-white/[0.07] bg-black/30 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 backdrop-blur-xl focus:border-red-500/30 focus:outline-none sm:w-64"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all',
                statusFilter === 'ALL' ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              All
            </button>
            {STATUS_KEYS.slice(0, 4).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all',
                  statusFilter === status ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <p className="mt-3 text-sm text-zinc-500">Loading execution history...</p>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-red-500/20 bg-red-500/[0.03] py-16 text-center">
          <AlertTriangle className="h-6 w-6 text-red-400" />
          <p className="mt-3 text-sm font-medium text-white">Could not load executions</p>
          <p className="mt-1 text-xs text-zinc-500">Ensure the backend is running on http://localhost:4000.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-16 text-center">
          <Cpu className="h-6 w-6 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-400">No executions found</p>
          <p className="mt-1 text-xs text-zinc-600">
            {searchQuery || statusFilter !== 'ALL'
              ? 'Try adjusting your filters.'
              : 'Run a task from the Dashboard to populate executions.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-white">Sessions</h2>
              <p className="mt-1 text-[11px] text-zinc-500">{filtered.length} execution{filtered.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((s, i) => {
              const duration =
                s.startedAt && s.completedAt
                  ? new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()
                  : null;
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
                >
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      s.status === 'COMPLETED' ? 'bg-emerald-500' :
                      s.status === 'RUNNING' ? 'bg-blue-500' :
                      s.status === 'FAILED' ? 'bg-red-500' :
                      s.status === 'CANCELLED' ? 'bg-zinc-500' :
                      'bg-amber-500',
                    )}
                  />

                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <p className="text-[12px] font-semibold text-white font-mono truncate">
                        {s.id.slice(0, 20)}…
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">{formatDate(s.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500">Steps</p>
                      <p className="text-[12px] font-mono text-zinc-300">
                        {s.currentStepIndex}/{s.totalSteps}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500">Duration</p>
                      <p className="text-[12px] font-mono text-zinc-300">
                        {duration ? formatDuration(duration) : '—'}
                      </p>
                    </div>
                    <div className="flex items-center justify-end">
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[10px] font-bold',
                          STATUS_COLORS[s.status]?.split(' ').slice(1).join(' ') || 'border-white/10 bg-white/[0.04] text-zinc-400',
                        )}
                      >
                        {s.status}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {filtered.length > 50 && (
            <p className="mt-4 text-center text-[11px] text-zinc-600">
              Showing all {filtered.length} sessions. Use filters to narrow results.
            </p>
          )}
        </div>
      )}
    </div>
    </Suspense></ErrorBoundary>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/15">
      <div className="mb-4 flex items-center justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-zinc-700 transition-colors group-hover:text-zinc-400" />
      </div>
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-[10px] text-zinc-600">{sub}</p>
    </div>
  );
}
