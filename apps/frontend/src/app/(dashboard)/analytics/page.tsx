'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Cpu,
  Zap,
  TrendingUp,
  Clock,
  ArrowUpRight,
  RefreshCw,
  Download,
} from 'lucide-react';

import { cn, formatNumber, formatCurrency } from '@/lib/utils';

/* ===========================================================
   MOCK ANALYTICS DATA
=========================================================== */

const CHART_DATA = [
  { day: 'Mon', tasks: 12, cost: 2.4 },
  { day: 'Tue', tasks: 19, cost: 3.8 },
  { day: 'Wed', tasks: 15, cost: 3.0 },
  { day: 'Thu', tasks: 22, cost: 4.4 },
  { day: 'Fri', tasks: 28, cost: 5.6 },
  { day: 'Sat', tasks: 8, cost: 1.6 },
  { day: 'Sun', tasks: 5, cost: 1.0 },
];

const COST_BREAKDOWN = [
  { label: 'Compute', value: 45, color: 'bg-blue-500' },
  { label: 'API Calls', value: 30, color: 'bg-purple-500' },
  { label: 'Storage', value: 15, color: 'bg-emerald-500' },
  { label: 'Bandwidth', value: 10, color: 'bg-yellow-500' },
];

/* ===========================================================
   COMPONENT
=========================================================== */

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  const totalTasks = 109;
  const totalCost = 21.8;
  const avgLatency = '3.2s';
  const successRate = 96.4;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Analytics Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Monitor performance, costs, and usage across your AI infrastructure
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>

          <button className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* ================================================= */}
      {/* TIME RANGE SELECTOR                            */}
      {/* ================================================= */}
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
        {(['7d', '30d', '90d'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
              timeRange === range
                ? 'bg-red-500/10 text-red-400'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 90 days'}
          </button>
        ))}
      </div>

      {/* ================================================= */}
      {/* KPI CARDS                                       */}
      {/* ================================================= */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={Zap}
          label="Total Tasks"
          value={formatNumber(totalTasks)}
          trend={12}
          trendLabel="vs last period"
          color="text-blue-400"
        />
        <KPICard
          icon={DollarSign}
          label="Total Cost"
          value={formatCurrency(totalCost)}
          trend={8}
          trendLabel="vs last period"
          color="text-emerald-400"
        />
        <KPICard
          icon={Clock}
          label="Avg Latency"
          value={avgLatency}
          trend={-5}
          trendLabel="improved"
          color="text-purple-400"
        />
        <KPICard
          icon={TrendingUp}
          label="Success Rate"
          value={`${successRate}%`}
          trend={2.1}
          trendLabel="vs last period"
          color="text-yellow-400"
        />
      </div>

      {/* ================================================= */}
      {/* CHARTS SECTION                                   */}
      {/* ================================================= */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Chart - Tasks Over Time */}
        <div className="lg:col-span-2 rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-white">
                Task Executions
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                Daily autonomous workflow runs
              </p>
            </div>
          </div>

          {/* Simple Bar Chart */}
          <div className="space-y-3">
            {CHART_DATA.map((data, i) => (
              <motion.div
                key={data.day}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                <span className="w-10 text-[11px] text-zinc-600 font-mono">
                  {data.day}
                </span>
                <div className="flex-1 h-8 rounded-lg bg-white/[0.04] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(data.tasks / 30) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05 }}
                    className="h-full rounded-lg bg-gradient-to-r from-red-500 to-red-400"
                  />
                </div>
                <span className="w-12 text-right text-[11px] font-mono text-zinc-500">
                  {data.tasks}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-white">
              Cost Breakdown
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              Where your budget goes
            </p>
          </div>

          <div className="space-y-3">
            {COST_BREAKDOWN.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-zinc-400">{item.label}</span>
                  <span className="text-[11px] font-semibold text-white">
                    {item.value}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', item.color)}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-white/[0.05]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-white">
                Total
              </span>
              <span className="text-[12px] font-bold text-red-400">
                ${formatCurrency(totalCost)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* AGENT PERFORMANCE                               */}
      {/* ================================================= */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
        <div className="mb-6">
          <h2 className="text-[15px] font-semibold text-white">
            Agent Performance
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            Per-agent execution metrics
          </p>
        </div>

        <div className="space-y-4">
          {[
            { name: 'PlannerAgent', tasks: 47, success: 98.2, avgTime: '2.1s' },
            { name: 'BrowserAgent', tasks: 89, success: 94.5, avgTime: '8.7s' },
            { name: 'PolicyEngine', tasks: 234, success: 100, avgTime: '0.8s' },
            { name: 'ExecutionCore', tasks: 156, success: 96.7, avgTime: '4.2s' },
          ].map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
            >
              <div className="flex-1">
                <p className="text-[12px] font-semibold text-white">
                  {agent.name}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500">
                  <span>{agent.tasks} tasks</span>
                  <span>·</span>
                  <span>{agent.avgTime} avg</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1">
                  <span className="text-[10px] font-bold text-emerald-400">
                    {agent.success}%
                  </span>
                </div>

                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   SUB-COMPONENTS
=========================================================== */

function KPICard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  trend: number;
  trendLabel: string;
  color: string;
}) {
  const isPositive = trend >= 0;

  return (
    <div className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/15">
      <div className="mb-4 flex items-center justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1 text-[10px] font-semibold">
          <ArrowUpRight className={cn('h-3 w-3', isPositive ? 'text-emerald-400' : 'text-red-400')} />
          {Math.abs(trend)}%
        </div>
      </div>

      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {value}
      </p>

      <p className={cn('mt-2 text-[10px]', isPositive ? 'text-emerald-400' : 'text-red-400')}>
        {trendLabel}
      </p>
    </div>
  );
}