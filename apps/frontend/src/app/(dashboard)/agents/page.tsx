'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  Globe,
  ShieldCheck,
  Cpu,
  Zap,
  Activity,
  Boxes,
  Puzzle,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Rocket,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAgentRegistry } from '@/hooks/useRuntimeData';

/* ===========================================================
   VISUAL MAPPING
   Real agent data carries no colors/icons, so we derive a
   stable look from the agent category/id.
=========================================================== */

const VISUALS = [
  { icon: BrainCircuit, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Cpu, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  { icon: Bot, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: Boxes, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
];

function visualFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return VISUALS[hash % VISUALS.length];
}

interface RegistryAgent {
  id: string;
  name: string;
  category: string;
  description: string;
  taskTypes: string[];
  pluginCount: number;
  plugins: string[];
}

/* ===========================================================
   PAGE
=========================================================== */

export default function AgentsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useAgentRegistry();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const router = useRouter();

  const agents: RegistryAgent[] = data?.agents ?? [];
  const plugins = data?.plugins ?? [];

  const totalTaskTypes = useMemo(
    () => agents.reduce((sum, a) => sum + (a.taskTypes?.length ?? 0), 0),
    [agents],
  );
  const totalPlugins = useMemo(
    () => agents.reduce((sum, a) => sum + (a.pluginCount ?? 0), 0),
    [agents],
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Agent Runtime</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Autonomous execution nodes registered in the runtime
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* STATS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Bot} label="Registered Agents" value={agents.length} color="text-emerald-400" />
        <StatCard icon={Zap} label="Task Types" value={totalTaskTypes} color="text-blue-400" />
        <StatCard icon={Puzzle} label="Plugins" value={totalPlugins} color="text-purple-400" />
        <StatCard icon={Activity} label="Available" value={plugins.length} color="text-yellow-400" />
      </div>

      {/* STATES */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <p className="mt-3 text-sm text-zinc-500">Loading agent registry...</p>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-red-500/20 bg-red-500/[0.03] py-16 text-center">
          <AlertTriangle className="h-6 w-6 text-red-400" />
          <p className="mt-3 text-sm font-medium text-white">Could not load the agent registry</p>
          <p className="mt-1 text-xs text-zinc-500">Make sure the backend is running on http://localhost:4000.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-16 text-center">
          <Bot className="h-6 w-6 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-400">No agents registered</p>
          <p className="mt-1 text-xs text-zinc-600">Agents will appear here once the runtime registers them.</p>
        </div>
      )}

      {/* AGENT GRID */}
      {!isLoading && !isError && agents.length > 0 && (
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent, i) => {
            const v = visualFor(agent.category || agent.id || agent.name);
            const Icon = v.icon;
            const isSelected = selectedAgent === agent.id;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.06, 0.4) }}
                onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                className={cn(
                  'group relative cursor-pointer overflow-hidden rounded-[24px] border bg-black/30 p-6 backdrop-blur-xl transition-all duration-300',
                  isSelected
                    ? 'border-red-500/30 shadow-lg shadow-red-500/10'
                    : 'border-white/[0.07] hover:border-white/15',
                )}
              >
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* Header */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl border', v.bg, v.border)}>
                      <Icon className={cn('h-6 w-6', v.color)} />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-white">{agent.name}</h3>
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{agent.category}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    REGISTERED
                  </div>
                </div>

                {/* Description */}
                <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">{agent.description}</p>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                  <Metric label="Task Types" value={String(agent.taskTypes?.length ?? 0)} />
                  <Metric label="Plugins" value={String(agent.pluginCount ?? 0)} />
                </div>

                {/* Task type tags */}
                {agent.taskTypes?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {agent.taskTypes.slice(0, 5).map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-zinc-400"
                      >
                        {t}
                      </span>
                    ))}
                    {agent.taskTypes.length > 5 && (
                      <span className="rounded-md px-2 py-0.5 text-[10px] text-zinc-600">
                        +{agent.taskTypes.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Job Agent launch button */}
                {agent.category === 'job' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push('/jobs'); }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Rocket className="h-4 w-4" />
                    Open Job Application Agent
                  </button>
                )}

                {/* Expanded plugin list */}
                {isSelected && agent.plugins?.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 border-t border-white/[0.06] pt-3"
                  >
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      <Puzzle className="h-3 w-3" /> Linked Plugins
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.plugins.map((p) => (
                        <span
                          key={p}
                          className="rounded-md border border-purple-500/15 bg-purple-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-purple-300"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
        </div>
      )}
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
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
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
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-600">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-white">{value}</p>
    </div>
  );
}
