'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  BarChart3,
  GitBranch,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

import { cn, formatDuration } from '@/lib/utils';

interface DailySuccessRate {
  date: string;
  success: number;
  failed: number;
  total: number;
  rate: number;
}

interface FailureReason {
  name: string;
  value: number;
  color: string;
}

interface StepDuration {
  step: string;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}

interface VersionComparison {
  version: string;
  successRate: number;
  avgDuration: number;
  runCount: number;
}

const DAILY_DATA: DailySuccessRate[] = [
  { date: 'Jun 24', success: 8, failed: 0, total: 8, rate: 100 },
  { date: 'Jun 25', success: 7, failed: 1, total: 8, rate: 87.5 },
  { date: 'Jun 26', success: 8, failed: 0, total: 8, rate: 100 },
  { date: 'Jun 27', success: 6, failed: 2, total: 8, rate: 75 },
  { date: 'Jun 28', success: 5, failed: 3, total: 8, rate: 62.5 },
  { date: 'Jun 29', success: 8, failed: 0, total: 8, rate: 100 },
  { date: 'Jun 30', success: 7, failed: 1, total: 8, rate: 87.5 },
  { date: 'Jul 01', success: 8, failed: 0, total: 8, rate: 100 },
];

const FAILURE_REASONS: FailureReason[] = [
  { name: 'Navigation Timeout', value: 38, color: '#ef4444' },
  { name: 'Element Not Found', value: 27, color: '#f97316' },
  { name: 'Rate Limit Exceeded', value: 15, color: '#eab308' },
  { name: 'Unexpected Popup', value: 12, color: '#6366f1' },
  { name: 'Network Error', value: 8, color: '#8b5cf6' },
];

const STEP_DURATIONS: StepDuration[] = [
  { step: 'Navigate', avgDuration: 8500, minDuration: 3200, maxDuration: 28500 },
  { step: 'Extract', avgDuration: 3200, minDuration: 1200, maxDuration: 8400 },
  { step: 'Assert', avgDuration: 1800, minDuration: 600, maxDuration: 5200 },
  { step: 'Screenshot', avgDuration: 4200, minDuration: 2100, maxDuration: 9800 },
  { step: 'Wait', avgDuration: 6000, minDuration: 3000, maxDuration: 12000 },
];

const VERSION_COMPARISONS: VersionComparison[] = [
  { version: 'v1', successRate: 82, avgDuration: 195000, runCount: 22 },
  { version: 'v2', successRate: 88, avgDuration: 172000, runCount: 15 },
  { version: 'v3', successRate: 94, avgDuration: 158000, runCount: 10 },
];

function StatCard({ label, value, change, icon: Icon, color }: {
  label: string;
  value: string;
  change?: { value: string; positive: boolean };
  icon: typeof Activity;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <p className={cn('text-2xl font-black', color)}>{value}</p>
      {change && (
        <div className="mt-1 flex items-center gap-1">
          {change.positive ? (
            <TrendingUp className="h-3 w-3 text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-400" />
          )}
          <span className={cn('text-[10px] font-semibold', change.positive ? 'text-emerald-400' : 'text-red-400')}>
            {change.value}
          </span>
          <span className="text-[10px] text-zinc-600">vs last week</span>
        </div>
      )}
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-white mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-[10px] text-zinc-400">
          {entry.name}: <span style={{ color: entry.color }} className="font-semibold">{entry.value}{entry.name === 'Success Rate' ? '%' : ''}</span>
        </p>
      ))}
    </div>
  );
}

export default function WorkflowAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d'>('7d');

  const avgDuration = Math.round(
    DAILY_DATA.reduce((sum, d) => sum + d.total, 0) > 0
      ? DAILY_DATA.reduce((sum, d) => sum + d.total, 0) * 150000 / DAILY_DATA.length
      : 0,
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/workflows/${id}`)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-black/30 text-zinc-500 hover:text-white transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Workflow Analytics</h1>
            <p className="mt-1 text-sm text-zinc-500">Performance metrics and execution insights</p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
          {(['7d', '14d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all',
                timeRange === range
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Success Rate"
          value="91.5%"
          change={{ value: '+4.2%', positive: true }}
          icon={CheckCircle2}
          color="text-emerald-400"
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(avgDuration)}
          change={{ value: '-12.3%', positive: true }}
          icon={Clock}
          color="text-blue-400"
        />
        <StatCard
          label="Total Failures"
          value={FAILURE_REASONS.reduce((s, r) => s + r.value, 0).toString()}
          change={{ value: '+2', positive: false }}
          icon={XCircle}
          color="text-red-400"
        />
        <StatCard
          label="Total Runs"
          value={DAILY_DATA.reduce((s, d) => s + d.total, 0).toString()}
          icon={Activity}
          color="text-white"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Success Rate Line Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Success Rate Over Time</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={DAILY_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: '#ef4444' }}
                  name="Success Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Failure Reasons Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Failure Reasons</h2>
          </div>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={FAILURE_REASONS}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {FAILURE_REASONS.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {FAILURE_REASONS.map((reason, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: reason.color }} />
                  <span className="text-[10px] text-zinc-500">{reason.name}</span>
                  <span className="text-[10px] text-zinc-400 font-semibold ml-auto">{reason.value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Step Duration Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Step Duration Breakdown</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={STEP_DURATIONS} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} unit="ms" />
                <YAxis dataKey="step" type="category" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgDuration" fill="#ef4444" radius={[0, 4, 4, 0]} name="Avg Duration" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Version Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Version Performance Comparison</h2>
          </div>
          <div className="space-y-3">
            {VERSION_COMPARISONS.map((v, i) => (
              <motion.div
                key={v.version}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white">{v.version}</span>
                  <span className="text-[10px] text-zinc-500">{v.runCount} runs</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-zinc-500">Success Rate</span>
                      <span className={cn('font-semibold', v.successRate >= 90 ? 'text-emerald-400' : v.successRate >= 80 ? 'text-yellow-400' : 'text-red-400')}>
                        {v.successRate}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          v.successRate >= 90 ? 'bg-emerald-500' : v.successRate >= 80 ? 'bg-yellow-500' : 'bg-red-500',
                        )}
                        style={{ width: `${v.successRate}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-zinc-500">Avg Duration</span>
                      <span className="text-xs font-mono text-white">{formatDuration(v.avgDuration)}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${100 - ((v.avgDuration - 140000) / 60000) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
