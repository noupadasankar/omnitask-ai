'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Search, Monitor, ShieldCheck, CheckSquare, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActiveAgent } from '@/store/agent.store';

interface AgentCardsProps {
  activeAgents: ActiveAgent[];
}

const ROLE_ICONS: Record<string, React.ComponentType<any>> = {
  planner: Cpu,
  research: Search,
  browser: Monitor,
  verification: ShieldCheck,
  approval: CheckSquare,
  reporting: MessageSquare,
};

const ROLE_COLORS: Record<string, string> = {
  planner: 'text-red-400 bg-red-500/10 border-red-500/20',
  research: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  browser: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  verification: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  approval: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  reporting: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

const ROLE_TITLES: Record<string, string> = {
  planner: 'Planner Agent',
  research: 'Research Agent',
  browser: 'Browser Agent',
  verification: 'Verifier Agent',
  approval: 'Policy Agent',
  reporting: 'Reporting Agent',
};

export function AgentCards({ activeAgents }: AgentCardsProps) {
  const displayAgents = activeAgents.length > 0 ? activeAgents : [
    { id: '1', role: 'planner', status: 'idle' },
    { id: '2', role: 'research', status: 'idle' },
    { id: '3', role: 'browser', status: 'idle' },
    { id: '4', role: 'verification', status: 'idle' },
    { id: '5', role: 'approval', status: 'idle' },
    { id: '6', role: 'reporting', status: 'idle' },
  ] as ActiveAgent[];

  const workingCount = displayAgents.filter(a => a.status === 'working').length;

  return (
    <div className="relative rounded-3xl border border-white/10 bg-zinc-950/40 p-5 backdrop-blur-2xl transition-all shadow-2xl flex flex-col min-h-[300px]">
      <div className="absolute inset-0 cyber-grid opacity-5 rounded-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Agent Fleet</h3>
          {workingCount > 0 && (
            <span className="text-[9px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
              {workingCount} ACTIVE
            </span>
          )}
        </div>
        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
          {displayAgents.length} WORKERS
        </span>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto pr-1 cyber-scroll">
        {displayAgents.map((agent, idx) => {
          const Icon = ROLE_ICONS[agent.role] || Cpu;
          const colors = ROLE_COLORS[agent.role] || 'text-zinc-400 bg-white/5 border-white/10';
          const title = ROLE_TITLES[agent.role] || agent.role;

          const isWorking = agent.status === 'working';
          const isCompleted = agent.status === 'completed';

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className={cn(
                "relative rounded-2xl border bg-black/40 p-4 transition-all flex flex-col items-center text-center justify-between min-h-[120px]",
                isWorking ? "border-red-500/20 bg-red-500/[0.02]" : "border-white/5"
              )}
            >
              {/* Working pulse */}
              {isWorking && (
                <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-red-500">
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                </div>
              )}

              {/* Completed checkmark */}
              {isCompleted && (
                <div className="absolute top-3 right-3 h-4 w-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="h-2.5 w-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              )}

              {/* Icon with pulse ring for active agents */}
              <div className={cn(
                "h-10 w-10 rounded-xl border flex items-center justify-center mb-2.5",
                colors,
                isWorking && "pulse-ring animate-pulse"
              )}>
                <Icon className="h-5 w-5" />
              </div>

              {/* Title & Status */}
              <div className="space-y-1.5 w-full">
                <h4 className="text-[11px] font-bold text-white tracking-wide truncate">{title}</h4>

                {/* Current task */}
                {agent.currentTask && isWorking && (
                  <p className="text-[8px] font-mono text-zinc-500 truncate leading-tight px-1">
                    {agent.currentTask}
                  </p>
                )}

                <span
                  className={cn(
                    "text-[8px] font-mono font-bold uppercase px-2 py-0.5 rounded-full inline-block",
                    isWorking && "bg-red-500/10 text-red-400 border border-red-500/20",
                    isCompleted && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                    agent.status === 'failed' && "bg-red-950 text-red-500 border border-red-900/50",
                    agent.status === 'idle' && "bg-white/5 text-zinc-500 border border-white/5"
                  )}
                >
                  {agent.status}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
