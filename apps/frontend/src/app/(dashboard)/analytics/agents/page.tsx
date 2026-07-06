'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  Clock,
  CheckCircle2,
  Layers,
  TrendingUp,
  ArrowUpRight,
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
} from 'recharts';

import { cn } from '@/lib/utils';

interface AgentStats {
  id: string;
  name: string;
  category: string;
  description: string;
  tasksCompleted: number;
  tasksFailed: number;
  avgDurationMs: number;
  totalTokens: number;
  successRate: number;
}

const MOCK_AGENTS: AgentStats[] = [
  { id: 'browser-agent', name: 'BrowserAgent', category: 'Execution', description: 'Web navigation & interaction', tasksCompleted: 342, tasksFailed: 23, avgDurationMs: 45200, totalTokens: 1_420_000, successRate: 93.7 },
  { id: 'planner-agent', name: 'PlannerAgent', category: 'Orchestration', description: 'Goal decomposition & planning', tasksCompleted: 289, tasksFailed: 12, avgDurationMs: 12400, totalTokens: 890_000, successRate: 96.0 },
  { id: 'extractor-agent', name: 'ExtractorAgent', category: 'Data', description: 'Structured data extraction', tasksCompleted: 198, tasksFailed: 8, avgDurationMs: 8900, totalTokens: 540_000, successRate: 96.1 },
  { id: 'validator-agent', name: 'ValidatorAgent', category: 'Quality', description: 'Step validation & verification', tasksCompleted: 421, tasksFailed: 31, avgDurationMs: 3200, totalTokens: 210_000, successRate: 93.1 },
  { id: 'memory-agent', name: 'MemoryAgent', category: 'Persistence', description: 'Episodic & semantic memory', tasksCompleted: 567, tasksFailed: 4, avgDurationMs: 1800, totalTokens: 120_000, successRate: 99.3 },
];

const CATEGORY_COLORS: Record<string, string> = {
  Execution: '#ef4444',
  Orchestration: '#818cf8',
  Data: '#34d399',
  Quality: '#f59e0b',
  Persistence: '#a78bfa',
};

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

export default function AgentAnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const agents = useMemo(() => {
    const factor = RANGE_DAYS[timeRange] / 30;
    return MOCK_AGENTS.map((a) => ({
      ...a,
      tasksCompleted: Math.round(a.tasksCompleted * factor),
      tasksFailed: Math.round(a.tasksFailed * factor),
      totalTokens: Math.round(a.totalTokens * factor),
    }));
  }, [timeRange]);

  const totalCompleted = agents.reduce((s, a) => s + a.tasksCompleted, 0);
  const totalFailed = agents.reduce((s, a) => s + a.tasksFailed, 0);
  const overallSuccess = totalCompleted + totalFailed
    ? (totalCompleted / (totalCompleted + totalFailed)) * 100
    : 0;
  const avgDuration = agents.reduce((s, a) => s + a.avgDurationMs, 0) / agents.length;

  const chartData = agents.map((a) => ({
    name: a.name.replace('Agent', ''),
    successRate: a.successRate,
    tasks: a.tasksCompleted,
    avgDuration: +(a.avgDurationMs / 1000).toFixed(1),
    tokens: +(a.totalTokens / 1000).toFixed(0),
  }));

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Agent Performance</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Per-agent metrics across your runtime infrastructure
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                timeRange === range
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {range === '7d' ? '7 days' : range === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Layers} label="Total Agents" value={String(agents.length)} sub="active agent types" color="text-indigo-400" />
        <StatCard icon={CheckCircle2} label="Tasks Completed" value={String(totalCompleted)} sub="across all agents" color="text-emerald-400" />
        <StatCard icon={TrendingUp} label="Avg Success Rate" value={`${overallSuccess.toFixed(1)}%`} sub="weighted average" color="text-amber-400" />
        <StatCard icon={Clock} label="Avg Duration" value={`${(avgDuration / 1000).toFixed(1)}s`} sub="per task" color="text-purple-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-white">Success Rate by Agent</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Percentage of completed tasks without failure</p>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} />
                <YAxis domain={[80, 100]} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} />
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
                <Bar dataKey="successRate" radius={[8, 8, 0, 0]} maxBarSize={48}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#818cf8', '#34d399', '#f59e0b', '#a78bfa'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-white">Tasks Completed</h2>
            <p className="mt-1 text-[11px] text-zinc-500">Volume per agent type</p>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
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
                <Bar dataKey="tasks" radius={[0, 8, 8, 0]} maxBarSize={32}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#818cf8', '#34d399', '#f59e0b', '#a78bfa'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {agents.map((agent, i) => (
          <motion.button
            key={agent.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
            className={cn(
              'relative overflow-hidden rounded-[20px] border p-5 backdrop-blur-xl text-left transition-all',
              selectedAgent === agent.id
                ? 'border-red-500/30 bg-red-500/[0.04]'
                : 'border-white/[0.07] bg-black/30 hover:border-white/15',
            )}
          >
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]"
                style={{ color: CATEGORY_COLORS[agent.category] ?? '#a1a1aa' }}
              >
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{agent.name}</p>
                <p className="text-[10px] text-zinc-500">{agent.category}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-500">Success Rate</span>
                  <span className="text-[11px] font-bold text-emerald-400">{agent.successRate}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${agent.successRate}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06 }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Tasks</span>
                <span className="text-[11px] font-mono text-zinc-300">{agent.tasksCompleted}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Avg Duration</span>
                <span className="text-[11px] font-mono text-zinc-300">{(agent.avgDurationMs / 1000).toFixed(1)}s</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Tokens</span>
                <span className="text-[11px] font-mono text-zinc-300">{(agent.totalTokens / 1000).toFixed(0)}K</span>
              </div>
            </div>

            <ArrowUpRight className="absolute right-4 top-4 h-3.5 w-3.5 text-zinc-700 transition-colors group-hover:text-zinc-400" />
          </motion.button>
        ))}
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
