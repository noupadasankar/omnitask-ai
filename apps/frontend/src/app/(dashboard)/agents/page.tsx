'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  Globe,
  ShieldCheck,
  Cpu,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  BarChart3,
  Settings,
  Play,
  Pause,
  RefreshCw,
} from 'lucide-react';

import { cn, formatNumber } from '@/lib/utils';

/* ===========================================================
   MOCK AGENT DATA
   Replace with real API once backend is ready
=========================================================== */

const AGENTS = [
  {
    id: 'planner',
    name: 'PlannerAgent',
    description: 'Decomposes complex tasks into executable subtasks',
    icon: BrainCircuit,
    status: 'active',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    model: 'GPT-4o',
    uptime: '99.8%',
    tasksProcessed: 1247,
    avgDuration: '2.3s',
    successRate: 98.2,
    activeTasks: 3,
  },
  {
    id: 'browser',
    name: 'BrowserAgent',
    description: 'Autonomous web navigation and data extraction',
    icon: Globe,
    status: 'active',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    model: 'GPT-4o + Playwright',
    uptime: '97.4%',
    tasksProcessed: 2891,
    avgDuration: '8.7s',
    successRate: 94.1,
    activeTasks: 1,
  },
  {
    id: 'policy',
    name: 'PolicyEngine',
    description: 'Validates actions against safety policies',
    icon: ShieldCheck,
    status: 'idle',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    model: 'Claude-3-Sonnet',
    uptime: '100%',
    tasksProcessed: 1847,
    avgDuration: '0.9s',
    successRate: 100,
    activeTasks: 0,
  },
  {
    id: 'executor',
    name: 'ExecutionCore',
    description: 'Executes validated actions across systems',
    icon: Cpu,
    status: 'active',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    model: 'GPT-4o',
    uptime: '98.9%',
    tasksProcessed: 3124,
    avgDuration: '4.2s',
    successRate: 96.7,
    activeTasks: 2,
  },
];

/* ===========================================================
   PAGE
=========================================================== */

export default function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const totalTasks = AGENTS.reduce((sum, a) => sum + a.tasksProcessed, 0);
  const avgSuccess =
    AGENTS.reduce((sum, a) => sum + a.successRate, 0) / AGENTS.length;
  const activeAgents = AGENTS.filter((a) => a.status === 'active').length;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Agent Runtime
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Autonomous execution nodes powering your workflows
          </p>
        </div>

        <button className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* ================================================= */}
      {/* STATS */}
      {/* ================================================= */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Bot}
          label="Active Agents"
          value={activeAgents}
          total={AGENTS.length}
          color="text-emerald-400"
        />
        <StatCard
          icon={Zap}
          label="Tasks Processed"
          value={formatNumber(totalTasks)}
          color="text-blue-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Success Rate"
          value={`${avgSuccess.toFixed(1)}%`}
          color="text-purple-400"
        />
        <StatCard
          icon={Activity}
          label="Avg Latency"
          value="3.2s"
          color="text-yellow-400"
        />
      </div>

      {/* ================================================= */}
      {/* AGENT GRID */}
      {/* ================================================= */}
      <div className="grid gap-4 sm:grid-cols-2">
        {AGENTS.map((agent, i) => {
          const Icon = agent.icon;
          const isActive = agent.status === 'active';

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelectedAgent(agent.id)}
              className={cn(
                'group relative cursor-pointer overflow-hidden rounded-[24px] border bg-black/30 p-6 backdrop-blur-xl transition-all duration-300',
                selectedAgent === agent.id
                  ? 'border-red-500/30 shadow-lg shadow-red-500/10'
                  : 'border-white/[0.07] hover:border-white/15',
              )}
            >
              {/* Top glow */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              {/* Header */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-2xl border',
                      agent.bg,
                      agent.border,
                    )}
                  >
                    <Icon className={cn('h-6 w-6', agent.color)} />
                  </div>

                  <div>
                    <h3 className="text-[15px] font-semibold text-white">
                      {agent.name}
                    </h3>
                    <p className="text-[11px] text-zinc-500">{agent.model}</p>
                  </div>
                </div>

                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                    isActive
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
                  )}
                >
                  <div
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500',
                    )}
                  />
                  {isActive ? 'ACTIVE' : 'IDLE'}
                </div>
              </div>

              {/* Description */}
              <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">
                {agent.description}
              </p>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <Metric label="Uptime" value={agent.uptime} />
                <Metric label="Avg Time" value={agent.avgDuration} />
                <Metric label="Tasks" value={formatNumber(agent.tasksProcessed)} />
                <Metric
                  label="Success"
                  value={`${agent.successRate}%`}
                  valueColor={
                    agent.successRate > 95 ? 'text-emerald-400' : 'text-yellow-400'
                  }
                />
              </div>

              {/* Active tasks badge */}
              {agent.activeTasks > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-2 py-1.5">
                  <Zap className="h-3 w-3 text-yellow-400" />
                  <span className="text-[11px] font-semibold text-yellow-400">
                    {agent.activeTasks} task{agent.activeTasks > 1 ? 's' : ''} running
                  </span>
                </div>
              )}

              {/* Actions (on hover) */}
              <div className="mt-4 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] text-xs text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white">
                  <BarChart3 className="h-3 w-3" />
                  Metrics
                </button>
                <button className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] text-xs text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white">
                  <Settings className="h-3 w-3" />
                  Config
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ===========================================================
   SUB-COMPONENTS
=========================================================== */

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  total?: number;
  color: string;
}) {
  return (
    <div className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/15">
      <div className="mb-4 flex items-center justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {value}
        {total && <span className="text-sm text-zinc-600"> / {total}</span>}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  valueColor = 'text-white',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-zinc-600">{label}</p>
      <p className={cn('mt-0.5 text-[13px] font-semibold', valueColor)}>{value}</p>
    </div>
  );
}