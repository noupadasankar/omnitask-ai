'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  HardDrive,
  Layers,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Hash,
  BarChart3,
  FolderOpen,
} from 'lucide-react';
import { cn, timeAgo, formatBytes, formatNumber } from '@/lib/utils';

interface Collection {
  id: string;
  name: string;
  vectorCount: number;
  dimensions: number;
  indexState: 'READY' | 'BUILDING' | 'FAILED';
  createdAt: string;
}

interface VectorStoreStats {
  totalVectors: number;
  totalDimensions: number;
  storageUsedBytes: number;
  indexHealth: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  lastIndexedAt: string;
  collections: Collection[];
}

const MOCK_DATA: VectorStoreStats = {
  totalVectors: 12483,
  totalDimensions: 1536,
  storageUsedBytes: 1024 * 1024 * 187,
  indexHealth: 'HEALTHY',
  lastIndexedAt: new Date(Date.now() - 1800000).toISOString(),
  collections: [
    { id: 'col_episodic', name: 'episodic_traces', vectorCount: 4872, dimensions: 1536, indexState: 'READY', createdAt: '2025-11-12T08:00:00Z' },
    { id: 'col_semantic', name: 'semantic_knowledge', vectorCount: 3911, dimensions: 1536, indexState: 'READY', createdAt: '2025-11-10T10:30:00Z' },
    { id: 'col_procedural', name: 'procedural_patterns', vectorCount: 2156, dimensions: 1536, indexState: 'READY', createdAt: '2025-12-01T14:00:00Z' },
    { id: 'col_working', name: 'working_context', vectorCount: 892, dimensions: 1536, indexState: 'READY', createdAt: '2026-01-15T09:00:00Z' },
    { id: 'col_agent', name: 'agent_persona', vectorCount: 652, dimensions: 1536, indexState: 'BUILDING', createdAt: '2026-02-20T16:00:00Z' },
  ],
};

const HEALTH_META = {
  HEALTHY: { label: 'Healthy', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle2 },
  DEGRADED: { label: 'Degraded', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: AlertTriangle },
  FAILED: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle },
};

const INDEX_META = {
  READY: { label: 'Ready', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  BUILDING: { label: 'Building', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  FAILED: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/10' },
};

export default function VectorStorePage() {
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const data = MOCK_DATA;
  const health = HEALTH_META[data.indexHealth];
  const HealthIcon = health.icon;

  const filtered = useMemo(
    () =>
      selectedCol
        ? data.collections.filter((c) => c.id === selectedCol)
        : data.collections,
    [selectedCol, data.collections],
  );

  const totalIndexed = data.collections.reduce((s, c) => s + c.vectorCount, 0);

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
            <Database className="h-3.5 w-3.5" />
            Vector Database
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Vector Store Management</h1>
          <p className="mt-1 text-zinc-400">
            Manage the high-dimensional vector index powering semantic retrieval.
          </p>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all">
          <RefreshCw className="h-4 w-4" />
          Sync
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Vectors"
          value={formatNumber(data.totalVectors)}
          change={`${formatNumber(totalIndexed)} indexed across collections`}
          icon={Layers}
          color="text-purple-400"
        />
        <StatCard
          title="Dimensions"
          value={formatNumber(data.totalDimensions)}
          change="Per vector"
          icon={Hash}
          color="text-blue-400"
        />
        <StatCard
          title="Storage Used"
          value={formatBytes(data.storageUsedBytes)}
          change="Disk usage for vector index"
          icon={HardDrive}
          color="text-emerald-400"
        />
        <StatCard
          title="Index Health"
          value={health.label}
          change={`Last indexed ${timeAgo(data.lastIndexedAt)}`}
          icon={BarChart3}
          color={health.color}
        />
      </div>

      {/* INDEX HEALTH CARD */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Index Status</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Real-time vector index health metrics</p>
          </div>
          <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5', health.border, health.bg)}>
            <HealthIcon className={cn('h-3.5 w-3.5', health.color)} />
            <span className={cn('text-[10px] font-bold', health.color)}>{health.label}</span>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.05] bg-black/40 p-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Coverage</span>
            <p className="mt-1 text-2xl font-black text-white">{((totalIndexed / data.totalVectors) * 100).toFixed(0)}%</p>
            <p className="text-[10px] text-zinc-600 mt-1">{formatNumber(totalIndexed)} / {formatNumber(data.totalVectors)} vectors indexed</p>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-black/40 p-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Avg Vectors / Collection</span>
            <p className="mt-1 text-2xl font-black text-white">{formatNumber(Math.round(totalIndexed / data.collections.length))}</p>
            <p className="text-[10px] text-zinc-600 mt-1">Across {data.collections.length} collections</p>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-black/40 p-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Last Indexed</span>
            <p className="mt-1 text-sm font-black text-white">{timeAgo(data.lastIndexedAt)}</p>
            <p className="text-[10px] text-zinc-600 mt-1">{new Date(data.lastIndexedAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* COLLECTIONS */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Collections</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{data.collections.length} vector namespaces</p>
          </div>
          <select
            value={selectedCol ?? ''}
            onChange={(e) => setSelectedCol(e.target.value || null)}
            className="h-9 rounded-xl border border-white/[0.07] bg-black/40 px-3 text-xs text-zinc-400 focus:outline-none focus:border-indigo-500/30"
          >
            <option value="">All Collections</option>
            {data.collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {filtered.map((col, i) => {
            const idxMeta = INDEX_META[col.indexState];
            return (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group flex items-start gap-4 rounded-2xl border border-white/[0.05] bg-black/20 p-4 transition-all hover:border-white/[0.08]"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-white font-mono">{col.name}</h3>
                    <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', idxMeta.bg, idxMeta.color)}>
                      {idxMeta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                    <span>{formatNumber(col.vectorCount)} vectors</span>
                    <span>·</span>
                    <span>{formatNumber(col.dimensions)}d</span>
                    <span>·</span>
                    <span>{timeAgo(col.createdAt)}</span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="h-8 w-24 rounded-lg bg-white/[0.03] overflow-hidden">
                    <div
                      className="h-full rounded-lg bg-gradient-to-r from-indigo-500/40 to-purple-500/40"
                      style={{
                        width: `${(col.vectorCount / totalIndexed) * 100}%`,
                        minWidth: 4,
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  change: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-zinc-500">{title}</span>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-black/30', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-lg font-black text-white">{value}</p>
      <p className="text-[10px] text-zinc-600 mt-2 font-medium">{change}</p>
    </div>
  );
}
