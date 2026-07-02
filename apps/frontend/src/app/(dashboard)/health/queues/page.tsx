'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { motion } from 'framer-motion';
import {
  Layers, Clock, CheckCircle2, XCircle,
  BarChart3, Gauge, ListOrdered,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueueData {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  avgProcessTime: number;
  latencyP99: number;
}

interface QueuesHealth {
  queues: QueueData[];
}

const MOCK: QueuesHealth = {
  queues: [
    { name: 'tasks', waiting: 23, active: 5, completed: 14_280, failed: 42, avgProcessTime: 340, latencyP99: 1200 },
    { name: 'steps', waiting: 12, active: 3, completed: 98_500, failed: 156, avgProcessTime: 180, latencyP99: 890 },
    { name: 'email', waiting: 8, active: 2, completed: 45_200, failed: 8, avgProcessTime: 620, latencyP99: 2100 },
    { name: 'notifications', waiting: 45, active: 7, completed: 210_000, failed: 23, avgProcessTime: 95, latencyP99: 450 },
    { name: 'webhooks', waiting: 3, active: 1, completed: 67_800, failed: 67, avgProcessTime: 280, latencyP99: 980 },
  ],
};

function QueueBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? value / max : 0;
  return (
    <div className="h-2 flex-1 rounded-full bg-white/[0.04] overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', color)}
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}

function LatencyChart({ data }: { data: QueueData[] }) {
  const maxLatency = Math.max(...data.map((q) => q.latencyP99));
  return (
    <div className="space-y-3">
      {data.map((q, i) => (
        <div key={q.name} className="flex items-center gap-3">
          <span className="w-24 text-[11px] font-medium text-zinc-400 capitalize">{q.name}</span>
          <div className="flex-1 h-3 rounded-full bg-white/[0.04] overflow-hidden relative">
            <motion.div
              className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/30 to-red-500"
              initial={{ width: 0 }}
              animate={{ width: `${(q.latencyP99 / maxLatency) * 100}%` }}
              transition={{ duration: 1, delay: i * 0.08, ease: 'easeOut' }}
            />
          </div>
          <span className="w-16 text-right font-mono text-[11px] text-zinc-400">{q.latencyP99}ms</span>
        </div>
      ))}
    </div>
  );
}

export default function QueuesHealthPage() {
  const { queues } = MOCK;
  const maxWaiting = Math.max(...queues.map((q) => q.waiting));
  const totalFailed = queues.reduce((a, q) => a + q.failed, 0);
  const totalCompleted = queues.reduce((a, q) => a + q.completed, 0);

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <Layers className="h-3.5 w-3.5 text-red-400" />
          Queue Health
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Queues</h1>
        <p className="mt-1 text-sm text-zinc-500">BullMQ queue status, backlogs, and processing latency.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Queues', value: queues.length, icon: ListOrdered, color: 'text-white' },
          { label: 'Total Waiting', value: queues.reduce((a, q) => a + q.waiting, 0), icon: Clock, color: 'text-amber-400' },
          { label: 'Total Completed', value: totalCompleted.toLocaleString(), icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Total Failed', value: totalFailed.toLocaleString(), icon: XCircle, color: totalFailed > 0 ? 'text-red-400' : 'text-zinc-400' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
            >
              <Icon className={cn('h-5 w-5', stat.color)} />
              <p className="mt-3 font-mono text-2xl font-black text-white">{stat.value}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{stat.label}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Queue Backlog</h2>
          </div>
          <div className="space-y-4">
            {queues.map((q, i) => (
              <motion.div
                key={q.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white capitalize">{q.name}</span>
                  <span className="font-mono text-[11px] text-zinc-400">{q.waiting} waiting · {q.active} active</span>
                </div>
                <div className="flex gap-1.5">
                  <QueueBar value={q.waiting} max={maxWaiting} color="bg-amber-500" />
                  <QueueBar value={q.active} max={maxWaiting} color="bg-red-500" />
                </div>
                <div className="mt-1 flex gap-4 text-[10px] text-zinc-600">
                  <span>{q.completed.toLocaleString()} completed</span>
                  {q.failed > 0 && <span className="text-red-400">{q.failed} failed</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Processing Latency (p99)</h2>
          </div>
          <LatencyChart data={queues} />
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <span className="text-[11px] text-zinc-500">
              Avg processing time across queues
            </span>
            <span className="font-mono text-sm font-bold text-white">
              {Math.round(queues.reduce((a, q) => a + q.avgProcessTime, 0) / queues.length)}ms
            </span>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-bold text-white">Queue Details</h2>
        </div>
        <div className="space-y-2">
          {queues.map((q, i) => (
            <motion.div
              key={q.name}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                  <Layers className="h-4 w-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white capitalize">{q.name}</p>
                  <p className="text-[10px] text-zinc-600">{q.avgProcessTime}ms avg</p>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-white">{q.waiting}</p>
                  <p className="text-[9px] text-zinc-600">waiting</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-white">{q.active}</p>
                  <p className="text-[9px] text-zinc-600">active</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-white">{q.completed.toLocaleString()}</p>
                  <p className="text-[9px] text-zinc-600">done</p>
                </div>
                <div className="text-right">
                  <p className={cn('font-mono text-xs font-bold', q.failed > 0 ? 'text-red-400' : 'text-white')}>{q.failed}</p>
                  <p className="text-[9px] text-zinc-600">failed</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
