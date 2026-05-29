'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  Globe,
  ShieldCheck,
  Cpu,
  Wifi,
  WifiOff,
  Zap,
  ArrowUpRight,
} from 'lucide-react';

import type { AgentEvent } from '@/hooks/useSocket';
import { cn, timeAgo } from '@/lib/utils';

/* ===========================================================
   AGENT DEFINITIONS
=========================================================== */

const AGENTS = [
  {
    name: 'PlannerAgent',
    role: 'Task decomposition',
    icon: BrainCircuit,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    status: 'active' as const,
    tasks: 3,
  },
  {
    name: 'BrowserAgent',
    role: 'Web automation',
    icon: Globe,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    status: 'active' as const,
    tasks: 1,
  },
  {
    name: 'PolicyEngine',
    role: 'Safety validation',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    status: 'idle' as const,
    tasks: 0,
  },
  {
    name: 'ExecutionCore',
    role: 'Action runtime',
    icon: Cpu,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    status: 'active' as const,
    tasks: 2,
  },
];

/* ===========================================================
   COMPONENT
=========================================================== */

interface AgentStatusPanelProps {
  connected: boolean;
  events: AgentEvent[];
  variant?: 'compact' | 'full';
}

export function AgentStatusPanel({
  connected,
  events,
  variant = 'compact',
}: AgentStatusPanelProps) {
  return (
    <div className="space-y-4">

      {/* ============================================ */}
      {/* HEADER */}
      {/* ============================================ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-zinc-500" />
          <h3 className="text-[13px] font-semibold text-white">
            Agent Runtime
          </h3>
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            connected
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
          )}
        >
          {connected ? (
            <>
              <Wifi className="h-2.5 w-2.5" />
              LIVE
            </>
          ) : (
            <>
              <WifiOff className="h-2.5 w-2.5" />
              OFFLINE
            </>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* AGENTS */}
      {/* ============================================ */}
      <div className="space-y-1.5">
        {AGENTS.map((agent, i) => {
          const Icon = agent.icon;
          const isActive = agent.status === 'active';

          return (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group relative flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 transition-all hover:bg-white/[0.04] cursor-pointer"
            >
              {/* Icon */}
              <div className="relative flex-shrink-0">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl border',
                    agent.bg,
                    agent.border,
                  )}
                >
                  <Icon className={cn('h-4 w-4', agent.color)} />
                </div>
                <div
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-black',
                    isActive ? 'bg-emerald-400' : 'bg-zinc-600',
                  )}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white truncate">
                  {agent.name}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {agent.role}
                </p>
              </div>

              {/* Task count */}
              {agent.tasks > 0 ? (
                <div className="flex items-center gap-1 rounded-md border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-0.5">
                  <Zap className="h-2.5 w-2.5 text-yellow-400" />
                  <span className="text-[10px] font-bold text-yellow-400">
                    {agent.tasks}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-zinc-700">idle</span>
              )}

              <ArrowUpRight className="h-3 w-3 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.div>
          );
        })}
      </div>

      {/* ============================================ */}
      {/* LIVE EVENT FEED (only if variant=full) */}
      {/* ============================================ */}
      {variant === 'full' && (
        <div className="mt-4 rounded-xl border border-white/[0.05] bg-black/30 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Event Stream
            </span>
            <span className="text-[10px] text-zinc-600">
              {events.length} events
            </span>
          </div>

          <div className="max-h-[200px] overflow-y-auto p-2 space-y-1">
            <AnimatePresence initial={false}>
              {events.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[11px] text-zinc-600">
                    Waiting for runtime events...
                  </p>
                </div>
              ) : (
                events.slice(0, 12).map((ev, i) => (
                  <motion.div
                    key={`${ev.at}-${i}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.02]"
                  >
                    <div className="mt-1 h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] text-emerald-400">
                        {ev.event}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {timeAgo(ev.at)}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}