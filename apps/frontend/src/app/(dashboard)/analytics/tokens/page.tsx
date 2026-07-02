'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import {
  FileText,
  TrendingUp,
  ArrowUpRight,
  BarChart3,
  Cpu,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart as RePieChart,
  Pie,
  Legend,
} from 'recharts';

import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

interface ModelTokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  percentage: number;
  color: string;
}

interface DailyTokenUsage {
  day: string;
  input: number;
  output: number;
  total: number;
}

const MODELS: ModelTokenUsage[] = [
  { model: 'GPT-4o', inputTokens: 2_340_000, outputTokens: 890_000, totalTokens: 3_230_000, percentage: 0, color: '#ef4444' },
  { model: 'GPT-4o-mini', inputTokens: 8_200_000, outputTokens: 3_100_000, totalTokens: 11_300_000, percentage: 0, color: '#f97316' },
  { model: 'Claude 3.5 Sonnet', inputTokens: 1_100_000, outputTokens: 420_000, totalTokens: 1_520_000, percentage: 0, color: '#818cf8' },
  { model: 'Claude 3 Haiku', inputTokens: 4_500_000, outputTokens: 1_800_000, totalTokens: 6_300_000, percentage: 0, color: '#34d399' },
];

const totalTokensAll = MODELS.reduce((s, m) => s + m.totalTokens, 0);
MODELS.forEach((m) => { m.percentage = (m.totalTokens / totalTokensAll) * 100; });

const DAILY_TOKENS: DailyTokenUsage[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  const input = 200_000 + Math.floor(Math.random() * 400_000);
  const output = 80_000 + Math.floor(Math.random() * 160_000);
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    input,
    output,
    total: input + output,
  };
});

const INPUT_RATIO = MODELS.map((m) => ({
  name: m.model,
  input: m.inputTokens,
  output: m.outputTokens,
}));

const AGGREGATIONS = [
  { label: 'Daily', value: 'daily' as const },
  { label: 'Weekly', value: 'weekly' as const },
  { label: 'Monthly', value: 'monthly' as const },
];

export default function TokenAnalyticsPage() {
  const [aggregation, setAggregation] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [chartView, setChartView] = useState<'overview' | 'breakdown'>('overview');

  const totalInput = MODELS.reduce((s, m) => s + m.inputTokens, 0);
  const totalOutput = MODELS.reduce((s, m) => s + m.outputTokens, 0);
  const avgDailyTokens = totalTokensAll / 30;

  const aggregated = useMemo(() => {
    if (aggregation === 'daily') return DAILY_TOKENS;
    if (aggregation === 'weekly') {
      const weeks: DailyTokenUsage[] = [];
      for (let w = 0; w < 4; w++) {
        const slice = DAILY_TOKENS.slice(w * 7, (w + 1) * 7);
        weeks.push({
          day: `Week ${w + 1}`,
          input: slice.reduce((s, d) => s + d.input, 0),
          output: slice.reduce((s, d) => s + d.output, 0),
          total: slice.reduce((s, d) => s + d.total, 0),
        });
      }
      return weeks;
    }
    const month = {
      day: 'This Month',
      input: DAILY_TOKENS.reduce((s, d) => s + d.input, 0),
      output: DAILY_TOKENS.reduce((s, d) => s + d.output, 0),
      total: DAILY_TOKENS.reduce((s, d) => s + d.total, 0),
    };
    return [month];
  }, [aggregation]);

  const _maxToken = Math.max(...aggregated.map((d) => d.total), 1);

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Token Consumption</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Input vs output token usage across all LLM models
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
          {AGGREGATIONS.map((agg) => (
            <button
              key={agg.value}
              onClick={() => setAggregation(agg.value)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                aggregation === agg.value
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {agg.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Total Tokens" value={formatNumber(totalTokensAll)} sub="all models" color="text-indigo-400" />
        <StatCard icon={BarChart3} label="Input Tokens" value={formatNumber(totalInput)} sub={`${(totalInput / totalTokensAll * 100).toFixed(0)}% of total`} color="text-blue-400" />
        <StatCard icon={TrendingUp} label="Output Tokens" value={formatNumber(totalOutput)} sub={`${(totalOutput / totalTokensAll * 100).toFixed(0)}% of total`} color="text-emerald-400" />
        <StatCard icon={Cpu} label="Avg Daily" value={formatNumber(Math.round(avgDailyTokens))} sub="tokens per day" color="text-amber-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-white">Token Usage Over Time</h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                {aggregation === 'daily' ? 'Daily token consumption' : aggregation === 'weekly' ? 'Weekly aggregation' : 'Monthly aggregation'}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-black/30 p-0.5">
              {(['overview', 'breakdown'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setChartView(v)}
                  className={cn(
                    'rounded-md px-3 py-1 text-[10px] font-semibold transition-all',
                    chartView === v ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {v === 'overview' ? 'Total' : 'Input/Output'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregated} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#fff' }}
                  itemStyle={{ color: '#a1a1aa' }}
                  formatter={(value: number) => formatNumber(value)}
                />
                {chartView === 'overview' ? (
                  <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={aggregation === 'monthly' ? 120 : 36} fill="#ef4444" />
                ) : (
                  <>
                    <Bar dataKey="input" radius={[8, 8, 0, 0]} maxBarSize={aggregation === 'monthly' ? 120 : 36} fill="#818cf4" stackId="a" />
                    <Bar dataKey="output" radius={[8, 8, 0, 0]} maxBarSize={aggregation === 'monthly' ? 120 : 36} fill="#34d399" stackId="a" />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {chartView === 'breakdown' && (
            <div className="mt-4 flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-indigo-400" />
                <span className="text-[11px] text-zinc-500">Input</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-zinc-500">Output</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-white">Distribution by Model</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Total token share per LLM</p>
          </div>
          <div className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={MODELS}
                  dataKey="totalTokens"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                >
                  {MODELS.map((m) => (
                    <Cell key={m.model} fill={m.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#fff' }}
                  itemStyle={{ color: '#a1a1aa' }}
                  formatter={(value: number) => formatNumber(value)}
                />
                <Legend
                  formatter={(value: string) => (
                    <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>
                  )}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
        <div className="mb-6">
          <h2 className="text-[15px] font-semibold text-white">Input vs Output by Model</h2>
          <p className="mt-1 text-[11px] text-zinc-500">Breakdown of token type per model</p>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={INPUT_RATIO} layout="vertical" barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(0,0,0,0.9)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#fff' }}
                itemStyle={{ color: '#a1a1aa' }}
                formatter={(value: number) => formatNumber(value)}
              />
              <Bar dataKey="input" name="Input" radius={[0, 4, 4, 0]} maxBarSize={24} fill="#818cf4" stackId="a" />
              <Bar dataKey="output" name="Output" radius={[0, 4, 4, 0]} maxBarSize={24} fill="#34d399" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
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
