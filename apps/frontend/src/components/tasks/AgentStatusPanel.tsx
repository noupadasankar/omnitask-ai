'use client';

import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Cpu,
  Globe,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { motion } from 'framer-motion';

import { AgentEvent } from '@/hooks/useSocket';

const agents = [
  {
    name: 'PlannerAgent',
    icon: BrainCircuit,
    status: 'ACTIVE',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
  },

  {
    name: 'BrowserAgent',
    icon: Globe,
    status: 'RUNNING',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },

  {
    name: 'PolicyEngine',
    icon: ShieldCheck,
    status: 'VALIDATING',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },

  {
    name: 'ExecutionCore',
    icon: Cpu,
    status: 'LIVE',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
  },
];

export function AgentStatusPanel({
  connected,
  events,
}: {
  connected: boolean;

  events: AgentEvent[];
}) {
  return (
    <div className="space-y-6">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-xl">
        {/* TOP */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Autonomous Runtime
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Multi-agent orchestration network
            </p>
          </div>

          {/* STATUS */}
          <div
            className={`
              flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium
              ${
                connected
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500'
              }
            `}
          >
            {connected ? (
              <>
                <Wifi className="h-3.5 w-3.5" />

                Runtime Live
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />

                Offline
              </>
            )}
          </div>
        </div>

        {/* AGENTS */}
        <div className="space-y-4 p-5">
          {agents.map((agent, index) => {
            const Icon = agent.icon;

            return (
              <motion.div
                key={agent.name}
                initial={{
                  opacity: 0,
                  y: 10,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  delay: index * 0.04,
                }}
                className="
                  group
                  relative
                  overflow-hidden
                  rounded-2xl
                  border
                  border-white/10
                  bg-black/20
                  p-4
                "
              >
                {/* GLOW */}
                <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-red-500/0 blur-3xl transition-all duration-500 group-hover:bg-red-500/10" />

                <div className="relative z-10 flex items-center justify-between">
                  {/* LEFT */}
                  <div className="flex items-center gap-4">
                    <div
                      className={`
                        flex h-12 w-12 items-center justify-center rounded-2xl border
                        ${agent.bg}
                      `}
                    >
                      <Icon
                        className={`h-6 w-6 ${agent.color}`}
                      />
                    </div>

                    <div>
                      <h3 className="font-medium text-white">
                        {agent.name}
                      </h3>

                      <p className="mt-1 text-xs text-zinc-500">
                        Autonomous execution node
                      </p>
                    </div>
                  </div>

                  {/* RIGHT */}
                  <div className="flex items-center gap-3">
                    <div className="hidden text-right md:block">
                      <p className="text-xs text-zinc-500">
                        Runtime Health
                      </p>

                      <p className="mt-1 text-sm font-medium text-white">
                        Operational
                      </p>
                    </div>

                    <div
                      className={`
                        flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium
                        ${agent.bg}
                        ${agent.color}
                      `}
                    >
                      <div className="h-2 w-2 animate-pulse rounded-full bg-current" />

                      {agent.status}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ================================================= */}
      {/* LIVE EVENTS */}
      {/* ================================================= */}

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-xl">
        {/* TOP */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Runtime Feed
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Live execution telemetry
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-300">
            <Activity className="h-3.5 w-3.5" />

            STREAMING
          </div>
        </div>

        {/* EVENTS */}
        <div className="max-h-[520px] space-y-3 overflow-y-auto p-5">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-black/30">
                <Bot className="h-10 w-10 text-zinc-600" />
              </div>

              <h3 className="text-lg font-semibold text-white">
                Waiting for Runtime Events
              </h3>

              <p className="mt-2 max-w-sm text-sm text-zinc-500">
                Agent execution logs and telemetry
                will appear here in realtime.
              </p>
            </div>
          ) : (
            events.map((ev, i) => (
              <motion.div
                key={`${ev.at}-${i}`}
                initial={{
                  opacity: 0,
                  y: 10,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  delay: i * 0.02,
                }}
                className="
                  overflow-hidden
                  rounded-2xl
                  border
                  border-white/10
                  bg-black/30
                "
              >
                {/* TOP */}
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />

                    <span className="font-mono text-xs text-emerald-400">
                      {ev.event}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Clock3 className="h-3 w-3" />

                    {new Date(
                      ev.at,
                    ).toLocaleTimeString()}
                  </div>
                </div>

                {/* CONTENT */}
                <div className="p-4">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-zinc-400">
                    {JSON.stringify(
                      ev.data,
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* ================================================= */}
      {/* SYSTEM HEALTH */}
      {/* ================================================= */}

      <div className="grid grid-cols-2 gap-4">
        <HealthCard
          label="Latency"
          value="142ms"
        />

        <HealthCard
          label="Queue Depth"
          value="12"
        />

        <HealthCard
          label="Success Rate"
          value="98.2%"
        />

        <HealthCard
          label="Workers"
          value="04"
        />
      </div>
    </div>
  );
}

/* ===================================================== */
/* HEALTH CARD */
/* ===================================================== */

function HealthCard({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {label}
        </p>

        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      </div>

      <p className="text-2xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}