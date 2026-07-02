'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { motion } from 'framer-motion';
import {
  Database, Activity, Clock, Table2, BarChart3,
  Wifi, AlertTriangle, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TableStat {
  name: string;
  rowCount: number;
  sizeMb: number;
  indexHitRate: number;
}

interface DatabaseHealth {
  poolSize: number;
  activeConnections: number;
  idleConnections: number;
  waitingQueries: number;
  avgQueryTime: number;
  slowQueries: number;
  queryLatency: { p50: number; p95: number; p99: number };
  tableStats: TableStat[];
}

const MOCK: DatabaseHealth = {
  poolSize: 50,
  activeConnections: 34,
  idleConnections: 12,
  waitingQueries: 4,
  avgQueryTime: 12,
  slowQueries: 3,
  queryLatency: { p50: 8, p95: 45, p99: 120 },
  tableStats: [
    { name: 'users', rowCount: 284_530, sizeMb: 182, indexHitRate: 0.97 },
    { name: 'tasks', rowCount: 1_245_800, sizeMb: 610, indexHitRate: 0.94 },
    { name: 'workflow_executions', rowCount: 892_100, sizeMb: 1_240, indexHitRate: 0.91 },
    { name: 'agent_sessions', rowCount: 156_200, sizeMb: 98, indexHitRate: 0.96 },
    { name: 'audit_logs', rowCount: 4_200_000, sizeMb: 2_800, indexHitRate: 0.88 },
  ],
};

function Gauge({ value, max, label, sub, color }: { value: number; max: number; label: string; sub: string; color: string }) {
  const pct = Math.min(value / max, 1);
  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-2 flex h-24 w-24 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeOpacity={0.05} strokeWidth="6" />
          <motion.circle
            cx="50" cy="50" r="42" fill="none" stroke={color}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - pct) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <motion.span
          className="font-mono text-lg font-black text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {Math.round(pct * 100)}%
        </motion.span>
      </div>
      <p className="text-xs font-semibold text-white">{label}</p>
      <p className="text-[10px] text-zinc-500">{sub}</p>
    </div>
  );
}

function LatencyBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = value / max;
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 text-[11px] font-mono text-zinc-500">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
        />
      </div>
      <span className="w-14 text-right font-mono text-[11px] text-zinc-400">{value}ms</span>
    </div>
  );
}

function TableRow({ stat, i }: { stat: TableStat; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + i * 0.05 }}
      className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <Table2 className="h-4 w-4 text-zinc-500" />
        <span className="text-xs font-semibold text-white">{stat.name}</span>
      </div>
      <div className="flex items-center gap-6">
        <span className="font-mono text-[11px] text-zinc-400">{stat.rowCount.toLocaleString()} rows</span>
        <span className="font-mono text-[11px] text-zinc-400">{stat.sizeMb} MB</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-16 rounded-full bg-white/[0.04] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${stat.indexHitRate * 100}%` }}
              transition={{ duration: 0.8, delay: 0.5 + i * 0.05 }}
            />
          </div>
          <span className="font-mono text-[10px] text-zinc-500">{(stat.indexHitRate * 100).toFixed(0)}%</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function DatabaseHealthPage() {
  const d = MOCK;
  const poolUtil = d.activeConnections / d.poolSize;

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <Database className="h-3.5 w-3.5 text-red-400" />
          Database Health
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Database</h1>
        <p className="mt-1 text-sm text-zinc-500">Connection pool, query latency, and table statistics.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <Wifi className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-bold text-white">Connection Pool</h2>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Gauge value={d.activeConnections} max={d.poolSize} label="Utilization" sub={`${d.activeConnections} / ${d.poolSize}`} color="#ef4444" />
          <div className="flex flex-col justify-center rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Active</p>
            <motion.p
              className="mt-1 font-mono text-2xl font-black text-white"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {d.activeConnections}
            </motion.p>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Idle</p>
            <motion.p
              className="mt-1 font-mono text-2xl font-black text-white"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              {d.idleConnections}
            </motion.p>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Waiting</p>
            <motion.p
              className={cn('mt-1 font-mono text-2xl font-black', d.waitingQueries > 0 ? 'text-amber-400' : 'text-white')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              {d.waitingQueries}
            </motion.p>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Query Latency</h2>
          </div>
          <div className="space-y-3">
            <LatencyBar label="p50" value={d.queryLatency.p50} max={d.queryLatency.p99} color="bg-emerald-500" />
            <LatencyBar label="p95" value={d.queryLatency.p95} max={d.queryLatency.p99} color="bg-amber-500" />
            <LatencyBar label="p99" value={d.queryLatency.p99} max={d.queryLatency.p99} color="bg-red-500" />
          </div>
          <div className="mt-4 flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <Activity className="h-4 w-4 text-zinc-500" />
            <div>
              <p className="text-[11px] text-zinc-500">Average Query Time</p>
              <p className="font-mono text-sm font-bold text-white">{d.avgQueryTime}ms</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-mono text-[11px] text-amber-400">{d.slowQueries} slow</span>
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
            <BarChart3 className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Pool Overview</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Pool Size</p>
              <p className="mt-1 font-mono text-xl font-black text-white">{d.poolSize}</p>
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Utilization</p>
              <p className="mt-1 font-mono text-xl font-black text-white">{(poolUtil * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Avg Query</p>
              <p className="mt-1 font-mono text-xl font-black text-white">{d.avgQueryTime}ms</p>
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Slow Queries</p>
              <p className={cn('mt-1 font-mono text-xl font-black', d.slowQueries > 0 ? 'text-amber-400' : 'text-white')}>{d.slowQueries}</p>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-bold text-white">Table Statistics</h2>
        </div>
        <div className="hidden grid-cols-[1fr_repeat(3,_auto)] gap-3 px-4 pb-2 text-[10px] uppercase tracking-wider text-zinc-600 sm:grid">
          <span>Table</span>
          <span>Rows</span>
          <span>Size</span>
          <span>Index Hit</span>
        </div>
        <div className="space-y-2">
          {d.tableStats.map((s, i) => <TableRow key={s.name} stat={s} i={i} />)}
        </div>
      </motion.div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
