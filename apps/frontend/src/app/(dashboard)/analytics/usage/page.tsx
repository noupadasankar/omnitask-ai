'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  FileText,
  PlayCircle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

interface DailyUsage {
  day: string;
  date: string;
  activeUsers: number;
  tasksCreated: number;
  sessionsStarted: number;
}

const CURRENT_WEEK: DailyUsage[] = [
  { day: 'Mon', date: '2026-06-29', activeUsers: 42, tasksCreated: 18, sessionsStarted: 24 },
  { day: 'Tue', date: '2026-06-30', activeUsers: 58, tasksCreated: 25, sessionsStarted: 31 },
  { day: 'Wed', date: '2026-07-01', activeUsers: 63, tasksCreated: 29, sessionsStarted: 37 },
  { day: 'Thu', date: '2026-07-02', activeUsers: 55, tasksCreated: 22, sessionsStarted: 28 },
  { day: 'Fri', date: '2026-07-03', activeUsers: 48, tasksCreated: 19, sessionsStarted: 22 },
  { day: 'Sat', date: '2026-07-04', activeUsers: 31, tasksCreated: 11, sessionsStarted: 14 },
  { day: 'Sun', date: '2026-07-05', activeUsers: 27, tasksCreated: 9, sessionsStarted: 12 },
];

const LAST_WEEK: DailyUsage[] = [
  { day: 'Mon', date: '2026-06-22', activeUsers: 38, tasksCreated: 16, sessionsStarted: 21 },
  { day: 'Tue', date: '2026-06-23', activeUsers: 51, tasksCreated: 22, sessionsStarted: 28 },
  { day: 'Wed', date: '2026-06-24', activeUsers: 57, tasksCreated: 26, sessionsStarted: 33 },
  { day: 'Thu', date: '2026-06-25', activeUsers: 50, tasksCreated: 20, sessionsStarted: 25 },
  { day: 'Fri', date: '2026-06-26', activeUsers: 44, tasksCreated: 17, sessionsStarted: 20 },
  { day: 'Sat', date: '2026-06-27', activeUsers: 28, tasksCreated: 10, sessionsStarted: 12 },
  { day: 'Sun', date: '2026-06-28', activeUsers: 24, tasksCreated: 8, sessionsStarted: 10 },
];

export default function UsagePage() {
  const [metric, setMetric] = useState<'activeUsers' | 'tasksCreated' | 'sessionsStarted'>('activeUsers');

  const metricConfig = {
    activeUsers: { label: 'Active Users', icon: Users, color: '#ef4444', gradient: 'url(#usersGradient)' },
    tasksCreated: { label: 'Tasks Created', icon: FileText, color: '#818cf8', gradient: 'url(#tasksGradient)' },
    sessionsStarted: { label: 'Sessions Started', icon: PlayCircle, color: '#34d399', gradient: 'url(#sessionsGradient)' },
  };

  const config = metricConfig[metric];

  const currentTotal = useMemo(() => {
    return CURRENT_WEEK.reduce((s, d) => s + d[metric], 0);
  }, [metric]);

  const lastTotal = useMemo(() => {
    return LAST_WEEK.reduce((s, d) => s + d[metric], 0);
  }, [metric]);

  const change = currentTotal - lastTotal;
  const changePercent = lastTotal ? (change / lastTotal) * 100 : 0;

  const avgCurrent = currentTotal / 7;
  const avgLast = lastTotal / 7;

  const chartData = CURRENT_WEEK.map((d, i) => ({
    day: d.day,
    current: d[metric],
    last: LAST_WEEK[i][metric],
  }));

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Platform Usage</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Daily active users, task creation, and session activity
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Active Users (This Week)"
          value={String(CURRENT_WEEK.reduce((s, d) => s + d.activeUsers, 0))}
          sub={`avg ${(CURRENT_WEEK.reduce((s, d) => s + d.activeUsers, 0) / 7).toFixed(0)}/day`}
          color="text-blue-400"
        />
        <StatCard
          icon={FileText}
          label="Tasks Created"
          value={String(CURRENT_WEEK.reduce((s, d) => s + d.tasksCreated, 0))}
          sub={`${CURRENT_WEEK.reduce((s, d) => s + d.tasksCreated, 0) > LAST_WEEK.reduce((s, d) => s + d.tasksCreated, 0) ? '+' : ''}${((CURRENT_WEEK.reduce((s, d) => s + d.tasksCreated, 0) / LAST_WEEK.reduce((s, d) => s + d.tasksCreated, 0) - 1) * 100).toFixed(0)}% vs last week`}
          color="text-indigo-400"
        />
        <StatCard
          icon={PlayCircle}
          label="Sessions Started"
          value={String(CURRENT_WEEK.reduce((s, d) => s + d.sessionsStarted, 0))}
          sub={`${CURRENT_WEEK.reduce((s, d) => s + d.sessionsStarted, 0) > LAST_WEEK.reduce((s, d) => s + d.sessionsStarted, 0) ? '+' : ''}${((CURRENT_WEEK.reduce((s, d) => s + d.sessionsStarted, 0) / LAST_WEEK.reduce((s, d) => s + d.sessionsStarted, 0) - 1) * 100).toFixed(0)}% vs last week`}
          color="text-emerald-400"
        />
        <StatCard
          icon={Activity}
          label="Avg Daily Active"
          value={(CURRENT_WEEK.reduce((s, d) => s + d.activeUsers, 0) / 7).toFixed(0)}
          sub={`${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}% vs last week`}
          color="text-amber-400"
        />
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl w-fit">
        {(Object.keys(metricConfig) as Array<keyof typeof metricConfig>).map((key) => (
          <button
            key={key}
            onClick={() => setMetric(key)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
              metric === key ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {metricConfig[key].label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-white">{config.label} Trend</h2>
              <p className="mt-1 text-[11px] text-zinc-500">This week vs last week comparison</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
              </span>
              {changePercent >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
            </div>
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#fff' }}
                  itemStyle={{ color: '#a1a1aa' }}
                />
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke={config.color}
                  strokeWidth={2.5}
                  dot={{ fill: config.color, strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: config.color }}
                  name="This Week"
                />
                <Line
                  type="monotone"
                  dataKey="last"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Last Week"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-white">Period Comparison</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Week-over-week summary</p>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[11px] text-zinc-500">This Week</p>
              <p className="mt-1 text-2xl font-bold text-white">{formatNumber(currentTotal)}</p>
              <p className="mt-1 text-[10px] text-zinc-600">avg {avgCurrent.toFixed(0)}/day</p>
            </div>

            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[11px] text-zinc-500">Last Week</p>
              <p className="mt-1 text-2xl font-bold text-white">{formatNumber(lastTotal)}</p>
              <p className="mt-1 text-[10px] text-zinc-600">avg {avgLast.toFixed(0)}/day</p>
            </div>

            <div className={cn(
              'rounded-xl border p-4',
              change >= 0
                ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                : 'border-red-500/20 bg-red-500/[0.03]',
            )}>
              <p className="text-[11px] text-zinc-500">Change</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  'text-2xl font-bold',
                  change >= 0 ? 'text-emerald-400' : 'text-red-400',
                )}>
                  {change >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
                </span>
                {change >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                )}
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">{Math.abs(change)} {config.label.toLowerCase()} difference</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {(Object.keys(metricConfig) as Array<keyof typeof metricConfig>).map((key) => {
          const cfg = metricConfig[key];
          const currentVal = CURRENT_WEEK.reduce((s, d) => s + d[key], 0);
          const lastVal = LAST_WEEK.reduce((s, d) => s + d[key], 0);
          const pct = lastVal ? ((currentVal - lastVal) / lastVal) * 100 : 0;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[20px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]" style={{ color: cfg.color }}>
                  <cfg.icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">{cfg.label}</p>
                  <p className="text-[10px] text-zinc-500">7-day total</p>
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">{currentVal}</span>
                <span className={cn(
                  'text-[12px] font-semibold flex items-center gap-0.5',
                  pct >= 0 ? 'text-emerald-400' : 'text-red-400',
                )}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                  {pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {CURRENT_WEEK.map((d, i) => {
                  const maxVal = Math.max(...CURRENT_WEEK.map((x) => x[key]), 1);
                  return (
                    <div key={d.day} className="flex items-center gap-2">
                      <span className="w-7 text-[10px] text-zinc-600">{d.day}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(d[key] / maxVal) * 100}%` }}
                          transition={{ duration: 0.6, delay: i * 0.03 }}
                          className="h-full rounded-full"
                          style={{ background: cfg.color }}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] font-mono text-zinc-500">{d[key]}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
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
