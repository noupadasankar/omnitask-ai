'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BrainCircuit,
  Database,
  Clock,
  Layers,
  Search,
  RefreshCw,
  Sparkles,
  Cpu,
  GitBranch,
  BookOpen,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemories } from '@/hooks/useRuntimeData';

interface AgentMemory {
  id: string;
  type: 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL' | 'WORKING';
  key: string;
  content: string;
  importance: number;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
}

const TYPE_META: Record<
  string,
  { name: string; desc: string; icon: any; color: string; bg: string; border: string }
> = {
  WORKING: {
    name: 'Working Memory',
    desc: 'Short-term context for active tasks and execution buffers.',
    icon: Cpu,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  SEMANTIC: {
    name: 'Semantic Memory',
    desc: 'Long-term embeddings and knowledge representation from past runs.',
    icon: BrainCircuit,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  EPISODIC: {
    name: 'Episodic Memory',
    desc: 'Specific execution traces, logs, and screenshots of tasks.',
    icon: Clock,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  PROCEDURAL: {
    name: 'Procedural Memory',
    desc: 'Learned workflow patterns, tools, and execution strategies.',
    icon: GitBranch,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'unknown';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MemoryPage() {
  const { data, isLoading, isError, refetch, isFetching } = useMemories();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');

  const memories: AgentMemory[] = Array.isArray(data) ? data : [];

  const clusters = useMemo(() => {
    return (['WORKING', 'SEMANTIC', 'EPISODIC', 'PROCEDURAL'] as const).map((t) => ({
      id: t,
      ...TYPE_META[t],
      count: memories.filter((m) => m.type === t).length,
      lastUpdated:
        memories
          .filter((m) => m.type === t)
          .map((m) => m.lastAccessedAt || m.createdAt)
          .sort()
          .reverse()[0] ?? null,
    }));
  }, [memories]);

  const avgImportance = useMemo(() => {
    if (!memories.length) return 0;
    return memories.reduce((s, m) => s + (m.importance ?? 0), 0) / memories.length;
  }, [memories]);

  const totalAccess = useMemo(
    () => memories.reduce((s, m) => s + (m.accessCount ?? 0), 0),
    [memories],
  );

  const filteredMemories = memories.filter((m) => {
    const matchesSearch =
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.key ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      selectedType === 'all' || m.type.toLowerCase() === selectedType.toLowerCase();
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/10 px-3 py-1 text-xs text-purple-300">
            <BrainCircuit className="h-3.5 w-3.5" />
            Knowledge Base
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">AI Memory Engine</h1>
          <p className="mt-1 text-zinc-400">
            Semantic knowledge store powering runtime agent intelligence and execution recall.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Sync Store
        </button>
      </div>

      {/* STAT CARDS — derived from real data */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Memories" value={String(memories.length)} change="Across all clusters" icon={Database} color="text-blue-400" />
        <StatCard title="Memory Clusters" value="4" change="Working · Semantic · Episodic · Procedural" icon={Layers} color="text-purple-400" />
        <StatCard title="Avg Importance" value={`${(avgImportance * 100).toFixed(0)}%`} change="Relevance weighting" icon={BookOpen} color="text-emerald-400" />
        <StatCard title="Total Recalls" value={String(totalAccess)} change="Cumulative access count" icon={Sparkles} color="text-amber-400" />
      </div>

      {/* MEMORY TYPE CLUSTERS */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Memory Clusters</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {clusters.map((type) => {
            const Icon = type.icon;
            const active = selectedType === type.id.toLowerCase();
            return (
              <motion.div
                key={type.id}
                whileHover={{ y: -4 }}
                className={cn(
                  'rounded-3xl border bg-white/[0.02] p-5 backdrop-blur-xl transition-all cursor-pointer hover:bg-white/[0.04]',
                  active ? 'border-purple-500/40' : type.border,
                )}
                onClick={() =>
                  setSelectedType(active ? 'all' : type.id.toLowerCase())
                }
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', type.bg, type.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs text-zinc-500">{relativeTime(type.lastUpdated)}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{type.name}</h3>
                <p className="text-xs text-zinc-500 mb-4 min-h-[32px] leading-relaxed">{type.desc}</p>
                <div className="flex items-center justify-between border-t border-white/[0.05] pt-3 text-xs">
                  <span className="font-semibold text-zinc-400">{type.count} entries</span>
                  <span className="text-zinc-600">{((type.count / Math.max(memories.length, 1)) * 100).toFixed(0)}%</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* SEMANTIC EXPLORER */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Semantic Memory Explorer</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Query and search the active long-term database</p>
          </div>

          <div className="flex gap-1.5 rounded-lg border border-white/[0.05] bg-black/40 p-1">
            {['all', 'semantic', 'procedural', 'episodic', 'working'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={cn(
                  'rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all',
                  selectedType === t
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/10'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories by content or key..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-white/[0.07] bg-white/[0.01] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/30 focus:bg-white/[0.03] transition-all"
          />
        </div>

        {/* STATES */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            <p className="mt-3 text-sm text-zinc-500">Loading memories...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.03] py-12 text-center">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <p className="mt-3 text-sm font-medium text-white">Could not load memories</p>
            <p className="mt-1 text-xs text-zinc-500">Ensure the backend is running.</p>
            <button onClick={() => refetch()} className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]">
              Retry
            </button>
          </div>
        )}

        {/* Memory List */}
        {!isLoading && !isError && (
          <div className="space-y-3">
            {filteredMemories.length > 0 ? (
              filteredMemories.map((mem) => (
                <div
                  key={mem.id}
                  className="group relative flex items-start gap-4 rounded-2xl border border-white/[0.05] bg-black/20 p-4 transition-all hover:bg-white/[0.01] hover:border-white/[0.08]"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-purple-500/15 border border-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300">
                        {mem.type}
                      </span>
                      {mem.key && (
                        <span className="text-[10px] text-zinc-500 font-medium font-mono">{mem.key}</span>
                      )}
                      <span className="ml-auto text-[10px] text-zinc-600">
                        {relativeTime(mem.lastAccessedAt || mem.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed pt-1 pr-2">{mem.content}</p>
                    <div className="flex items-center gap-3 pt-1 text-[10px] text-zinc-600">
                      <span>importance {(mem.importance * 100).toFixed(0)}%</span>
                      <span>·</span>
                      <span>{mem.accessCount} recalls</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 border border-dashed border-white/[0.05] rounded-2xl">
                <BrainCircuit className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 font-semibold">
                  {memories.length === 0 ? 'No memories stored yet' : 'No memories match query'}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  {memories.length === 0
                    ? 'Memories accumulate as agents execute tasks.'
                    : 'Try resetting filters or changing terms.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-zinc-500">{title}</span>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-black/30', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="text-[10px] text-zinc-600 mt-2 font-medium">{change}</p>
    </div>
  );
}
