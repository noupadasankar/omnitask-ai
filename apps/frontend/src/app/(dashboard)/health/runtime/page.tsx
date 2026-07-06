'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { motion } from 'framer-motion';
import {
  Cpu, MemoryStick, Clock, Activity,
  Timer, Radio, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RuntimeHealth {
  memory: { heapUsed: number; heapTotal: number; rss: number; external: number };
  cpu: { usage: number; eventLoopLag: number };
  uptime: number;
  activeHandles: number;
  activeRequests: number;
  version: string;
}

const MOCK: RuntimeHealth = {
  memory: { heapUsed: 284, heapTotal: 512, rss: 420, external: 38 },
  cpu: { usage: 34, eventLoopLag: 2.1 },
  uptime: 172_800,
  activeHandles: 47,
  activeRequests: 12,
  version: 'v20.11.0',
};

function RadialGauge({ value, max, label, color, unit }: { value: number; max: number; label: string; color: string; unit: string }) {
  const pct = Math.min(value / max, 1);
  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-2 flex h-32 w-32 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeOpacity={0.05} strokeWidth="8" />
          <motion.circle
            cx="50" cy="50" r="42" fill="none" stroke={color}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - pct) }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        </svg>
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p className="font-mono text-2xl font-black text-white">{value}{unit}</p>
          <p className="text-[10px] text-zinc-500">{max}{unit}</p>
        </motion.div>
      </div>
      <p className="text-xs font-semibold text-white">{label}</p>
      <p className="text-[10px] text-zinc-500">{(pct * 100).toFixed(0)}% used</p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color ?? 'text-zinc-500')} />
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <p className={cn('mt-2 font-mono text-lg font-black', color ?? 'text-white')}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p>}
    </div>
  );
}

export default function RuntimeHealthPage() {
  const d = MOCK;
  const heapPct = d.memory.heapUsed / d.memory.heapTotal;
  const rssPct = d.memory.rss / (d.memory.heapTotal * 1.5);
  const cpuPct = d.cpu.usage / 100;
  const days = Math.floor(d.uptime / 86400);
  const hours = Math.floor((d.uptime % 86400) / 3600);

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <Cpu className="h-3.5 w-3.5 text-red-400" />
          Runtime Health
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Runtime</h1>
        <p className="mt-1 text-sm text-zinc-500">Node.js process metrics, memory, CPU, and event loop.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <MemoryStick className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Memory</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RadialGauge value={d.memory.heapUsed} max={d.memory.heapTotal} label="Heap Used" unit="MB" color="#ef4444" />
            <RadialGauge value={d.memory.rss} max={Math.round(d.memory.heapTotal * 1.5)} label="RSS" unit="MB" color="#f97316" />
            <RadialGauge value={d.memory.external} max={128} label="External" unit="MB" color="#8b5cf6" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">CPU & Event Loop</h2>
          </div>
          <div className="flex flex-col items-center">
            <div className="relative mb-2 flex h-32 w-32 items-center justify-center">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeOpacity={0.05} strokeWidth="8" />
                <motion.circle
                  cx="50" cy="50" r="42" fill="none" stroke="#ef4444"
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - cpuPct) }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                />
              </svg>
              <motion.div
                className="text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <p className="font-mono text-2xl font-black text-white">{d.cpu.usage}%</p>
                <p className="text-[10px] text-zinc-500">CPU</p>
              </motion.div>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-full border border-white/[0.05] bg-white/[0.02] px-3 py-1.5">
              <Timer className="h-3 w-3 text-zinc-500" />
              <span className="text-[11px] text-zinc-400">Event loop lag</span>
              <span className={cn('font-mono text-xs font-bold', d.cpu.eventLoopLag > 5 ? 'text-red-400' : 'text-emerald-400')}>
                {d.cpu.eventLoopLag}ms
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Process Info</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={Clock} label="Uptime" value={`${days}d ${hours}h`} sub={d.version} />
            <MetricCard icon={Radio} label="Active Handles" value={String(d.activeHandles)} />
            <MetricCard icon={Activity} label="Active Requests" value={String(d.activeRequests)} />
            <MetricCard icon={Cpu} label="Node Version" value={d.version} />
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <div>
              <p className="text-[11px] font-semibold text-amber-300">Memory Pressure</p>
              <p className="text-[10px] text-zinc-500">
                Heap at {(heapPct * 100).toFixed(0)}% · RSS at {(rssPct * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
