'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Layers,
  Cpu,
  Database,
  BrainCircuit,
  Sparkles,
  Hash,
  BarChart3,
  Search,
  RefreshCw,
} from 'lucide-react';
import { cn, timeAgo, formatNumber } from '@/lib/utils';

interface RecentEmbedding {
  id: string;
  textPreview: string;
  dimensions: number;
  importance: number;
  createdAt: string;
}

interface EmbeddingStats {
  model: string;
  dimensions: number;
  totalEmbeddings: number;
  avgImportance: number;
  recentEmbeddings: RecentEmbedding[];
}

const MOCK_DATA: EmbeddingStats = {
  model: 'text-embedding-3-large',
  dimensions: 1536,
  totalEmbeddings: 12483,
  avgImportance: 0.72,
  recentEmbeddings: Array.from({ length: 12 }, (_, i) => ({
    id: `emb_${(i + 1).toString().padStart(4, '0')}`,
    textPreview: [
      'The user prefers concise responses with bullet points for technical documentation.',
      'Agent identified common error pattern in ETL pipeline: timeout on datasets exceeding 50k rows.',
      'Workflow "daily_report_gen" learned preference for PDF output with embedded charts.',
      'User authentication flow requires re-validation after 15 minutes of inactivity.',
      'Database schema migration v3.2 introduced breaking changes to the analytics API.',
      'Agent discovered optimal chunking strategy: 512 tokens with 10% overlap for code files.',
      'User expressed strong preference against markdown tables in email summaries.',
      'Error handling pattern: retry with exponential backoff for transient HTTP 429 responses.',
      'Context window usage peaks at 78% when processing multi-file code review requests.',
      'Procedural memory consolidated: deployment sequence now cached as reusable workflow pattern.',
      'User session identified recurring task: weekly infrastructure cost analysis every Monday.',
      'Agent learned that user prefers TypeScript over JSDoc for type definitions in new projects.',
    ][i] ?? 'Memory entry with contextual embedding data.',
    dimensions: 1536,
    importance: 0.45 + Math.random() * 0.5,
    createdAt: new Date(Date.now() - i * 3600000 * (1 + Math.random())).toISOString(),
  })),
};

const DIMENSION_BUCKETS = [
  { label: 'Token Semantics', count: 512, color: 'bg-purple-500/20 text-purple-300' },
  { label: 'Syntax Features', count: 384, color: 'bg-blue-500/20 text-blue-300' },
  { label: 'Intent Signals', count: 256, color: 'bg-emerald-500/20 text-emerald-300' },
  { label: 'Context Markers', count: 192, color: 'bg-amber-500/20 text-amber-300' },
  { label: 'Metadata', count: 128, color: 'bg-red-500/20 text-red-300' },
  { label: 'Reserved', count: 64, color: 'bg-zinc-500/20 text-zinc-300' },
];

export default function EmbeddingsPage() {
  const [search, setSearch] = useState('');
  const data = MOCK_DATA;

  const filtered = useMemo(
    () =>
      data.recentEmbeddings.filter((e) =>
        e.textPreview.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, data.recentEmbeddings],
  );

  const avgImportancePct = (data.avgImportance * 100).toFixed(0);

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
            <Layers className="h-3.5 w-3.5" />
            Vector Store
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Embedding Visualization</h1>
          <p className="mt-1 text-zinc-400">
            High-dimensional vector representations powering semantic memory retrieval.
          </p>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Embedding Model"
          value={data.model}
          change="OpenAI text-embedding-3-large"
          icon={BrainCircuit}
          color="text-purple-400"
        />
        <StatCard
          title="Vector Dimensions"
          value={formatNumber(data.dimensions)}
          change="Per embedding vector"
          icon={Hash}
          color="text-blue-400"
        />
        <StatCard
          title="Total Embeddings"
          value={formatNumber(data.totalEmbeddings)}
          change="Indexed vectors"
          icon={Database}
          color="text-emerald-400"
        />
        <StatCard
          title="Avg Importance"
          value={`${avgImportancePct}%`}
          change="Weighted relevance score"
          icon={BarChart3}
          color="text-amber-400"
        />
      </div>

      {/* DIMENSION BREAKDOWN */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Dimension Composition</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Feature breakdown across {formatNumber(data.dimensions)} vector dimensions</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-black/40 px-3 py-1.5">
            <Cpu className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-[10px] font-mono text-zinc-500">{data.model}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DIMENSION_BUCKETS.map((b) => (
            <div
              key={b.label}
              className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-black/40 px-4 py-3"
            >
              <div>
                <span className="text-xs text-zinc-400">{b.label}</span>
                <div className="mt-1 h-1.5 w-24 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500/60 to-purple-500/60"
                    style={{ width: `${(b.count / data.dimensions) * 100}%` }}
                  />
                </div>
              </div>
              <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-mono font-bold', b.color)}>
                {formatNumber(b.count)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* RECENT EMBEDDINGS */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Recent Embeddings</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {filtered.length} of {data.totalEmbeddings} vectors
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter embeddings..."
              className="h-9 w-52 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500/30 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          {filtered.map((emb, i) => (
            <motion.div
              key={emb.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group flex items-start gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-4 transition-all hover:border-white/[0.08] hover:bg-white/[0.01]"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 leading-relaxed line-clamp-2">{emb.textPreview}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                  <span className="font-mono">{emb.id}</span>
                  <span>·</span>
                  <span>{formatNumber(emb.dimensions)}d</span>
                  <span>·</span>
                  <span className={cn(
                    'font-semibold',
                    emb.importance > 0.7 ? 'text-emerald-400' : emb.importance > 0.4 ? 'text-amber-400' : 'text-zinc-500',
                  )}>
                    importance {(emb.importance * 100).toFixed(0)}%
                  </span>
                  <span className="ml-auto">{timeAgo(emb.createdAt)}</span>
                </div>
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/[0.05] rounded-2xl">
              <Search className="h-8 w-8 text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-500">No matching embeddings</p>
            </div>
          )}
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
      <p className="text-lg font-black text-white truncate">{value}</p>
      <p className="text-[10px] text-zinc-600 mt-2 font-medium">{change}</p>
    </div>
  );
}
