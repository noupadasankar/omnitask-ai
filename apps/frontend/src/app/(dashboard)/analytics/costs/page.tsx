'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Globe,
  FileText,
  Zap,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

interface CostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costPer1KInput: number;
  costPer1KOutput: number;
  totalCost: number;
  requests: number;
}

interface DailyCost {
  day: string;
  date: string;
  gpt4: number;
  gpt35: number;
  claude: number;
  total: number;
}

const MODELS: CostBreakdown[] = [
  { model: 'GPT-4o', inputTokens: 2_340_000, outputTokens: 890_000, costPer1KInput: 0.005, costPer1KOutput: 0.015, totalCost: 25.05, requests: 1240 },
  { model: 'GPT-4o-mini', inputTokens: 8_200_000, outputTokens: 3_100_000, costPer1KInput: 0.0015, costPer1KOutput: 0.006, totalCost: 30.90, requests: 8900 },
  { model: 'Claude 3.5 Sonnet', inputTokens: 1_100_000, outputTokens: 420_000, costPer1KInput: 0.003, costPer1KOutput: 0.015, totalCost: 9.60, requests: 520 },
  { model: 'Claude 3 Haiku', inputTokens: 4_500_000, outputTokens: 1_800_000, costPer1KInput: 0.00025, costPer1KOutput: 0.00125, totalCost: 3.38, requests: 4200 },
];

const DAILY_COSTS: DailyCost[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  const gpt4 = 0.65 + Math.random() * 0.9;
  const gpt35 = 0.85 + Math.random() * 1.2;
  const claude = 0.2 + Math.random() * 0.5;
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    date: d.toISOString().slice(0, 10),
    gpt4: +gpt4.toFixed(2),
    gpt35: +gpt35.toFixed(2),
    claude: +claude.toFixed(2),
    total: +(gpt4 + gpt35 + claude).toFixed(2),
  };
});

const COST_PER_DOMAIN = [
  { domain: 'Job Applications', cost: 18.40, tasks: 45, color: '#ef4444' },
  { domain: 'Food Ordering', cost: 12.30, tasks: 38, color: '#f59e0b' },
  { domain: 'Shopping', cost: 15.75, tasks: 52, color: '#34d399' },
  { domain: 'Travel Booking', cost: 8.90, tasks: 22, color: '#818cf8' },
  { domain: 'Research', cost: 5.60, tasks: 31, color: '#a78bfa' },
];

export default function CostAnalyticsPage() {
  const [view, setView] = useState<'daily' | 'model'>('daily');

  const totalCost = MODELS.reduce((s, m) => s + m.totalCost, 0);
  const totalRequests = MODELS.reduce((s, m) => s + m.requests, 0);
  const totalInputTokens = MODELS.reduce((s, m) => s + m.inputTokens, 0);
  const avgCostPerTask = totalCost / 100;

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Cost & Token Usage</h1>
          <p className="mt-1 text-sm text-zinc-500">
            OpenAI API expenditure and token consumption breakdown
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
          {(['daily', 'model'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                view === v
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {v === 'daily' ? 'Daily Trend' : 'By Model'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={DollarSign} label="Total Cost" value={formatCurrency(totalCost)} sub="all models" color="text-emerald-400" />
        <StatCard icon={Zap} label="Total Requests" value={String(totalRequests)} sub="API calls" color="text-blue-400" />
        <StatCard icon={FileText} label="Input Tokens" value={`${(totalInputTokens / 1_000_000).toFixed(1)}M`} sub="total consumed" color="text-indigo-400" />
        <StatCard icon={TrendingUp} label="Avg Cost / Task" value={formatCurrency(avgCostPerTask)} sub="across all domains" color="text-amber-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-white">
              {view === 'daily' ? 'Daily Cost Trend' : 'Cost by Model'}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              {view === 'daily' ? 'API expenditure over the last 30 days' : 'Breakdown per LLM provider'}
            </p>
          </div>
          <div className="h-[300px]">
            {view === 'daily' ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={DAILY_COSTS}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} tickFormatter={(v) => `$${v}`} />
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
                  <Area type="monotone" dataKey="total" stroke="#ef4444" fill="url(#costGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="space-y-3">
                {MODELS.map((m, i) => (
                  <motion.div
                    key={m.model}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-white">{m.model}</span>
                        <span className="text-[10px] text-zinc-500">({m.requests.toLocaleString()} req)</span>
                      </div>
                      <span className="text-[12px] font-semibold text-emerald-400">{formatCurrency(m.totalCost)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(m.totalCost / totalCost) * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.07 }}
                        className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400"
                      />
                    </div>
                  </motion.div>
                ))}
                <div className="pt-4 mt-4 border-t border-white/[0.05] flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white">Total</span>
                  <span className="text-[12px] font-bold text-red-400">{formatCurrency(totalCost)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-white">Cost per Domain</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Where the budget is being spent</p>
          </div>
          <div className="space-y-4">
            {COST_PER_DOMAIN.map((d, i) => (
              <motion.div
                key={d.domain}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" style={{ color: d.color }} />
                    <span className="text-[12px] font-medium text-white">{d.domain}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-white">{formatCurrency(d.cost)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.cost / Math.max(...COST_PER_DOMAIN.map((x) => x.cost))) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.07 }}
                    className="h-full rounded-full"
                    style={{ background: d.color }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-600">{d.tasks} tasks</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
        <div className="mb-6">
          <h2 className="text-[15px] font-semibold text-white">Model Breakdown</h2>
          <p className="mt-1 text-[11px] text-zinc-500">Token and cost details per model</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.05] text-[11px] text-zinc-500">
                <th className="pb-3 font-medium">Model</th>
                <th className="pb-3 font-medium">Input Tokens</th>
                <th className="pb-3 font-medium">Output Tokens</th>
                <th className="pb-3 font-medium">Cost / 1K Input</th>
                <th className="pb-3 font-medium">Cost / 1K Output</th>
                <th className="pb-3 font-medium">Requests</th>
                <th className="pb-3 font-medium text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {MODELS.map((m, i) => (
                <motion.tr
                  key={m.model}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-b border-white/[0.03] text-[12px] text-zinc-400"
                >
                  <td className="py-3 font-medium text-white">{m.model}</td>
                  <td className="py-3 font-mono">{(m.inputTokens / 1_000).toFixed(0)}K</td>
                  <td className="py-3 font-mono">{(m.outputTokens / 1_000).toFixed(0)}K</td>
                  <td className="py-3 font-mono">${m.costPer1KInput.toFixed(4)}</td>
                  <td className="py-3 font-mono">${m.costPer1KOutput.toFixed(4)}</td>
                  <td className="py-3 font-mono">{m.requests.toLocaleString()}</td>
                  <td className="py-3 font-mono text-right text-emerald-400 font-semibold">{formatCurrency(m.totalCost)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
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
