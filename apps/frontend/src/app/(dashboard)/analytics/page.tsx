'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu,
  Zap,
  TrendingUp,
  Clock,
  ArrowUpRight,
  RefreshCw,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useExecutionHistory } from '@/hooks/useRuntimeData';

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

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500',
  RUNNING: 'bg-blue-500',
  FAILED: 'bg-red-500',
  CANCELLED: 'bg-zinc-500',
  PAUSED: 'bg-amber-500',
  PENDING: 'bg-purple-500',
  PLANNING: 'bg-purple-500',
  WAITING_APPROVAL: 'bg-yellow-500',
};

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const { data, isLoading, isError, refetch, isFetching } = useExecutionHistory();

  const sessions: Session[] = Array.isArray(data) ? data : [];

  const inRange = useMemo(() => {
    const cutoff = Date.now() - RANGE_DAYS[timeRange] * 86400 * 1000;
    return sessions.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
  }, [sessions, timeRange]);

  const stats = useMemo(() => {
    const total = inRange.length;
    const terminal = inRange.filter((s) =>
      ['COMPLETED', 'FAILED', 'CANCELLED'].includes(s.status),
    );
    const completed = inRange.filter((s) => s.status === 'COMPLETED').length;
    const successRate = terminal.length
      ? (completed / terminal.length) * 100
      : 0;

    const durations = inRange
      .filter((s) => s.startedAt && s.completedAt)
      .map(
        (s) =>
          (new Date(s.completedAt!).getTime() -
            new Date(s.startedAt!).getTime()) /
          1000,
      )
      .filter((d) => d >= 0);
    const avgLatency = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return { total, completed, successRate, avgLatency };
  }, [inRange]);

  // Status breakdown (replaces the old fake "cost breakdown")
  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    inRange.forEach((s) => {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
    });
    const total = inRange.length || 1;
    return Object.entries(counts)
      .map(([label, value]) => ({
        label,
        value: Math.round((value / total) * 100),
        count: value,
        color: STATUS_COLORS[label] ?? 'bg-zinc-500',
      }))
      .sort((a, b) => b.count - a.count);
  }, [inRange]);

  // Daily run chart (last 7 buckets within range)
  const chartData = useMemo(() => {
    const days = Math.min(RANGE_DAYS[timeRange], 7);
    const buckets: { day: string; tasks: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const count = sessions.filter((s) => {
        const t = new Date(s.createdAt).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      buckets.push({
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        tasks: count,
      });
    }
    return buckets;
  }, [sessions, timeRange]);

  const maxTasks = Math.max(...chartData.map((d) => d.tasks), 1);

  const handleExport = () => {
    const header = 'id,taskId,status,totalSteps,createdAt,startedAt,completedAt\n';
    const rows = inRange
      .map(
        (s) =>
          `${s.id},${s.taskId},${s.status},${s.totalSteps},${s.createdAt},${s.startedAt ?? ''},${s.completedAt ?? ''}`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${timeRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Analytics Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Execution performance and runtime health across your agent infrastructure
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

          <button
            onClick={handleExport}
            disabled={inRange.length === 0}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* TIME RANGE */}
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
        {(['7d', '30d', '90d'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
              timeRange === range ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 90 days'}
          </button>
        ))}
      </div>

      {/* STATES */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <p className="mt-3 text-sm text-zinc-500">Loading execution history...</p>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-red-500/20 bg-red-500/[0.03] py-16 text-center">
          <AlertTriangle className="h-6 w-6 text-red-400" />
          <p className="mt-3 text-sm font-medium text-white">Could not load analytics</p>
          <p className="mt-1 text-xs text-zinc-500">Ensure the backend is running on http://localhost:4000.</p>
          <button onClick={() => refetch()} className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* KPI CARDS */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard icon={Zap} label="Total Executions" value={String(stats.total)} sub={`in last ${RANGE_DAYS[timeRange]} days`} color="text-blue-400" />
            <KPICard icon={CheckCircle2} label="Completed" value={String(stats.completed)} sub="successful runs" color="text-emerald-400" />
            <KPICard icon={Clock} label="Avg Duration" value={stats.avgLatency ? `${stats.avgLatency.toFixed(1)}s` : '—'} sub="start to finish" color="text-purple-400" />
            <KPICard icon={TrendingUp} label="Success Rate" value={`${stats.successRate.toFixed(1)}%`} sub="of terminal runs" color="text-yellow-400" />
          </div>

          {inRange.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-16 text-center">
              <Cpu className="h-6 w-6 text-zinc-600" />
              <p className="mt-3 text-sm font-medium text-zinc-400">No executions in this period</p>
              <p className="mt-1 text-xs text-zinc-600">Run a task from the Dashboard to populate analytics.</p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Daily executions chart */}
              <div className="lg:col-span-2 rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
                <div className="mb-6">
                  <h2 className="text-[15px] font-semibold text-white">Task Executions</h2>
                  <p className="mt-1 text-[11px] text-zinc-500">Daily autonomous workflow runs</p>
                </div>

                <div className="space-y-3">
                  {chartData.map((d, i) => (
                    <motion.div
                      key={`${d.day}-${i}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3"
                    >
                      <span className="w-10 text-[11px] text-zinc-600 font-mono">{d.day}</span>
                      <div className="flex-1 h-8 rounded-lg bg-white/[0.04] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(d.tasks / maxTasks) * 100}%` }}
                          transition={{ duration: 0.8, delay: i * 0.05 }}
                          className="h-full rounded-lg bg-gradient-to-r from-red-500 to-red-400"
                        />
                      </div>
                      <span className="w-12 text-right text-[11px] font-mono text-zinc-500">{d.tasks}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Status breakdown */}
              <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
                <div className="mb-6">
                  <h2 className="text-[15px] font-semibold text-white">Status Breakdown</h2>
                  <p className="mt-1 text-[11px] text-zinc-500">Distribution of run outcomes</p>
                </div>

                <div className="space-y-3">
                  {statusBreakdown.map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-zinc-400">{item.label}</span>
                        <span className="text-[11px] font-semibold text-white">{item.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={cn('h-full rounded-full', item.color)} style={{ width: `${item.value}%` }} />
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-5 pt-4 border-t border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-white">Total Runs</span>
                    <span className="text-[12px] font-bold text-red-400">{inRange.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent sessions table */}
          {inRange.length > 0 && (
            <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-[15px] font-semibold text-white">Recent Executions</h2>
                <p className="mt-1 text-[11px] text-zinc-500">Latest agent runs</p>
              </div>

              <div className="space-y-3">
                {inRange.slice(0, 8).map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-white font-mono truncate">
                        {s.id.slice(0, 16)}…
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500">
                        <span>{s.totalSteps} steps</span>
                        <span>·</span>
                        <span>{new Date(s.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-1 text-[10px] font-bold',
                        s.status === 'COMPLETED'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : s.status === 'FAILED'
                            ? 'border-red-500/20 bg-red-500/10 text-red-400'
                            : 'border-white/10 bg-white/[0.04] text-zinc-400',
                      )}
                    >
                      {s.status}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KPICard({
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
