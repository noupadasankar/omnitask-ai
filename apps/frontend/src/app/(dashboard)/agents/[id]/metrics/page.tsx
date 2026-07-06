'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Cpu,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentsApi } from '@/lib/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts';

interface MetricPoint {
  label: string;
  value: number;
  baseline?: number;
}

const TASK_TREND: MetricPoint[] = Array.from({ length: 14 }, (_, i) => ({
  label: `Day ${i + 1}`,
  value: Math.floor(Math.random() * 15 + 5),
}));

const ERROR_RATE: MetricPoint[] = Array.from({ length: 14 }, (_, i) => ({
  label: `Day ${i + 1}`,
  value: Number((Math.random() * 12 + 1).toFixed(1)),
}));

const AVG_DURATION: MetricPoint[] = Array.from({ length: 14 }, (_, i) => ({
  label: `Day ${i + 1}`,
  value: Math.floor(Math.random() * 40000 + 15000),
}));

const TOKEN_USAGE: MetricPoint[] = Array.from({ length: 14 }, (_, i) => ({
  label: `Day ${i + 1}`,
  value: Math.floor(Math.random() * 8000 + 2000),
}));

const CHART_COLORS = {
  red: '#ef4444',
  redDim: 'rgba(239, 68, 68, 0.1)',
  blue: '#3b82f6',
  blueDim: 'rgba(59, 130, 246, 0.1)',
  purple: '#a855f7',
  purpleDim: 'rgba(168, 85, 247, 0.1)',
  green: '#10b981',
  greenDim: 'rgba(16, 185, 129, 0.1)',
  text: '#71717a',
  grid: 'rgba(255, 255, 255, 0.05)',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-zinc-950/90 px-4 py-3 text-xs shadow-xl backdrop-blur-xl">
      <p className="font-semibold text-white mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function AgentMetricsPage() {
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    agentsApi
      .get(id)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-red-400" />
        <p className="mt-3 text-sm text-zinc-500">Loading metrics...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat icon={TrendingUp} label="Total Tasks" value="142" trend="+12%" trendUp color="text-emerald-400" />
        <MiniStat icon={AlertTriangle} label="Error Rate" value="5.3%" trend="-2.1%" trendUp={false} color="text-red-400" />
        <MiniStat icon={Clock} label="Avg Step Duration" value="3.4s" trend="-8%" trendUp color="text-blue-400" />
        <MiniStat icon={Cpu} label="Avg Tokens/Task" value="4.2K" trend="+15%" trendUp={false} color="text-purple-400" />
      </div>

      {/* Task Completion Trend */}
      <ChartCard
        title="Task Completion Trend"
        subtitle="Number of tasks completed per day"
        icon={BarChart3}
        color="text-red-400"
      >
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={TASK_TREND}>
            <defs>
              <linearGradient id="taskGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.red} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" name="Tasks" stroke={CHART_COLORS.red} fill="url(#taskGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Error Rate Over Time */}
      <ChartCard
        title="Error Rate Over Time"
        subtitle="Percentage of failed steps per day"
        icon={AlertTriangle}
        color="text-blue-400"
      >
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={ERROR_RATE}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="value" name="Error Rate" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ fill: CHART_COLORS.blue, r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Average Step Duration */}
      <ChartCard
        title="Average Step Duration"
        subtitle="Mean time per step in milliseconds"
        icon={Clock}
        color="text-purple-400"
      >
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={AVG_DURATION}>
            <defs>
              <linearGradient id="durationGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" name="Avg Duration (ms)" stroke={CHART_COLORS.purple} fill="url(#durationGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Token Usage per Task */}
      <ChartCard
        title="Token Usage per Task"
        subtitle="Average tokens consumed per task execution"
        icon={Cpu}
        color="text-emerald-400"
      >
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={TOKEN_USAGE}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="value" name="Tokens" stroke={CHART_COLORS.green} strokeWidth={2} dot={{ fill: CHART_COLORS.green, r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
    </Suspense></ErrorBoundary>
  );
}

function MiniStat({
  icon: Icon, label, value, trend, trendUp, color,
}: {
  icon: any; label: string; value: string; trend: string; trendUp: boolean; color: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]', color)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={cn('flex items-center gap-0.5 text-[10px] font-semibold', trendUp ? 'text-emerald-400' : 'text-red-400')}>
          {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend}
        </span>
      </div>
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, color, children }: {
  title: string; subtitle: string; icon: any; color: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-3">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]', color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-[10px] text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
