'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';

interface CompletionDay {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

interface TaskTypeDuration {
  type: string;
  avgDurationMs: number;
  count: number;
}

interface ErrorBreakdown {
  reason: string;
  count: number;
  percentage: number;
}

interface AnalyticsData {
  completionRate: number;
  totalSessions: number;
  avgDurationMs: number;
  errorRate: number;
  dailyCompletion: CompletionDay[];
  taskTypeDurations: TaskTypeDuration[];
  errorBreakdown: ErrorBreakdown[];
  mostCommonFailures: { reason: string; count: number }[];
}

const MOCK_DATA: AnalyticsData = {
  completionRate: 0.784,
  totalSessions: 1247,
  avgDurationMs: 245000,
  errorRate: 0.126,
  dailyCompletion: Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const completed = Math.floor(40 + Math.random() * 60);
    const failed = Math.floor(5 + Math.random() * 20);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      completed,
      failed,
      total: completed + failed,
    };
  }),
  taskTypeDurations: [
    { type: 'Code Review', avgDurationMs: 312000, count: 342 },
    { type: 'Web Scraping', avgDurationMs: 485000, count: 187 },
    { type: 'Data Analysis', avgDurationMs: 523000, count: 256 },
    { type: 'Deployment', avgDurationMs: 178000, count: 412 },
    { type: 'Report Gen', avgDurationMs: 95000, count: 50 },
  ],
  errorBreakdown: [
    { reason: 'API Timeout', count: 58, percentage: 36.7 },
    { reason: 'Rate Limit', count: 32, percentage: 20.3 },
    { reason: 'Auth Failure', count: 27, percentage: 17.1 },
    { reason: 'Invalid Input', count: 24, percentage: 15.2 },
    { reason: 'Internal Error', count: 17, percentage: 10.7 },
  ],
  mostCommonFailures: [
    { reason: 'API Timeout — upstream service exceeded 30s threshold', count: 58 },
    { reason: 'Rate Limit Exceeded — too many concurrent requests', count: 32 },
    { reason: 'Authentication token expired during long-running task', count: 27 },
    { reason: 'Invalid input schema — payload validation failed', count: 24 },
    { reason: 'Internal assertion error in vector search kernel', count: 17 },
  ],
};

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '14d' | '30d'>('14d');
  const data = MOCK_DATA;

  const displayedDays = useMemo(() => {
    const limit = period === '7d' ? 7 : period === '14d' ? 14 : 30;
    return data.dailyCompletion.slice(-limit);
  }, [period, data.dailyCompletion]);

  const avgCompletion = useMemo(
    () => displayedDays.reduce((s, d) => s + d.completed, 0) / displayedDays.length,
    [displayedDays],
  );

  const maxTotal = useMemo(
    () => Math.max(...displayedDays.map((d) => d.total), 1),
    [displayedDays],
  );

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs text-red-300">
            <BarChart3 className="h-3.5 w-3.5" />
            Intelligence
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">History Analytics</h1>
          <p className="mt-1 text-zinc-400">
            Performance metrics, duration breakdowns, and error analysis across all sessions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '14d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                period === p
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
              )}
            >
              {p}
            </button>
          ))}
          <button className="ml-2 flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Completion Rate"
          value={`${(data.completionRate * 100).toFixed(1)}%`}
          change={`${data.totalSessions} total sessions`}
          icon={TrendingUp}
          color="text-emerald-400"
        />
        <StatCard
          title="Avg Duration"
          value={formatDuration(data.avgDurationMs)}
          change="Mean session runtime"
          icon={Clock}
          color="text-blue-400"
        />
        <StatCard
          title="Error Rate"
          value={`${(data.errorRate * 100).toFixed(1)}%`}
          change="Of all sessions"
          icon={XCircle}
          color="text-red-400"
        />
        <StatCard
          title="Daily Avg (Completed)"
          value={avgCompletion.toFixed(0)}
          change="Selected period"
          icon={Activity}
          color="text-amber-400"
        />
      </div>

      {/* COMPLETION RATE CHART */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Completion Rate Over Time</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Daily completed vs failed sessions</p>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-zinc-500">Completed</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-zinc-500">Failed</span>
            </span>
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-40">
          {displayedDays.map((day, _i) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
              <div className="w-full flex flex-col-reverse gap-0.5" style={{ height: `${(day.total / maxTotal) * 100}%` }}>
                <div
                  className="w-full rounded-t-sm bg-red-500/60 transition-all hover:bg-red-500/80"
                  style={{ height: `${(day.failed / Math.max(day.total, 1)) * 100}%` }}
                  title={`${day.failed} failed`}
                />
                <div
                  className="w-full rounded-t-sm bg-emerald-500/60 transition-all hover:bg-emerald-500/80"
                  style={{ height: `${(day.completed / Math.max(day.total, 1)) * 100}%` }}
                  title={`${day.completed} completed`}
                />
              </div>
              <span className="text-[8px] text-zinc-600 mt-1 rotate-45 origin-left whitespace-nowrap">
                {day.date}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AVG DURATION & ERROR BREAKDOWN SIDE BY SIDE */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* AVG DURATION PER TASK TYPE */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-5">Avg Duration per Task Type</h2>
          <div className="space-y-3">
            {data.taskTypeDurations.map((t) => {
              const maxDur = Math.max(...data.taskTypeDurations.map((x) => x.avgDurationMs));
              return (
                <div key={t.type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-300 font-semibold">{t.type}</span>
                    <span className="text-[10px] text-zinc-500">{formatDuration(t.avgDurationMs)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-500/50 to-indigo-500/50"
                      style={{ width: `${(t.avgDurationMs / maxDur) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-zinc-600 mt-0.5 block">{t.count} sessions</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ERROR BREAKDOWN */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-5">Error Rate Breakdown</h2>
          <div className="space-y-3">
            {data.errorBreakdown.map((err) => (
              <div key={err.reason}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-300">{err.reason}</span>
                  <span className="text-[10px] text-zinc-500">{err.count} ({err.percentage.toFixed(0)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500/60"
                    style={{ width: `${err.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MOST COMMON FAILURE REASONS */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="text-lg font-bold text-white">Most Common Failure Reasons</h2>
        </div>
        <div className="space-y-2">
          {data.mostCommonFailures.map((f, i) => (
            <motion.div
              key={f.reason}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-black/20 px-4 py-3"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/10 text-[10px] font-bold text-red-400">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-zinc-300">{f.reason}</span>
              <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-red-400">
                {f.count}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  change: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-zinc-500">{title}</span>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-black/30', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-lg font-black text-white">{value}</p>
      <p className="text-[10px] text-zinc-600 mt-2 font-medium">{change}</p>
    </div>
  );
}
