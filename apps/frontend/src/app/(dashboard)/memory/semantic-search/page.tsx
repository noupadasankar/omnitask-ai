'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  BrainCircuit,
  Clock,
  GitBranch,
  Cpu,
  Sparkles,
  Filter,
  Timer,
  Hash,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

type MemoryType = 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL' | 'WORKING';

interface SearchResult {
  id: string;
  type: MemoryType;
  content: string;
  similarity: number;
  createdAt: string;
}

const TYPE_META: Record<MemoryType, { label: string; icon: any; color: string; bg: string }> = {
  EPISODIC: { label: 'Episodic', icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  SEMANTIC: { label: 'Semantic', icon: BrainCircuit, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  PROCEDURAL: { label: 'Procedural', icon: GitBranch, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  WORKING: { label: 'Working', icon: Cpu, color: 'text-blue-400', bg: 'bg-blue-500/10' },
};

const CORPUS: SearchResult[] = Array.from({ length: 36 }, (_, i) => {
  const types: MemoryType[] = ['EPISODIC', 'SEMANTIC', 'PROCEDURAL', 'WORKING'];
  const snippets = [
    'Agent completed web scraping task for e-commerce product catalog with 98.3% accuracy.',
    'User authentication flow: session tokens expire after 15 minutes of inactivity.',
    'Preferred response format: bullet-pointed summaries with code blocks for technical queries.',
    'Database migration v3.2 introduced breaking changes affecting analytics API endpoints.',
    'Error handling pattern: exponential backoff for HTTP 429 responses with jitter.',
    'Context window utilization peaks at 78% during multi-file code review tasks.',
    'Weekly infrastructure cost analysis recurring task scheduled every Monday at 9 AM.',
    'Deployment workflow preference: canary releases with automated rollback on failure.',
    'Agent learned user dislikes markdown tables in email summaries — use plain lists instead.',
    'Optimal chunking strategy: 512 tokens with 10% overlap for TypeScript source files.',
    'ETL pipeline timeout threshold identified: 30 seconds for datasets under 50k rows.',
    'User prefers TypeScript over JSDoc for type definitions in new project scaffolding.',
    'Agent discovered recurrent pattern in user edit history: prefers 2-space indentation.',
    'Memory consolidation triggered: cached reusable deployment sequence as workflow pattern.',
    'User session detected recurring query pattern — infrastructure cost analysis every Monday.',
    'Agent self-correction: switched from REST to GraphQL for batch data fetching operations.',
    'Procedural memory updated: code review checklist now includes accessibility audit step.',
    'Working memory buffer cleared after task completion — context window reset to baseline.',
    'Episodic trace: user manually overrode agent recommendation for third-party API selection.',
    'Semantic cluster expanded: added 47 new vector embeddings for CI/CD pipeline knowledge.',
    'Procedural knowledge distilled: deployment rollback sequence consolidated into 3-step workflow.',
    'Working context: current task involves refactoring authentication middleware for Next.js app.',
    'User feedback recorded: prefers agent to ask clarifying questions rather than assume intent.',
    'Agent memory pruned: removed 182 low-importance embeddings (< 0.3 threshold) from store.',
    'Semantic search index rebuilt: cosine similarity matching improved by 12% after retraining.',
    'Episodic memory: user navigation pattern shows preference for keyboard shortcuts over mouse.',
    'Procedural optimization: test execution order reorganized to run critical path tests first.',
    'Working memory: holding reference to PR #2473 for code review during current session.',
    'Agent identified that user consistently rejects auto-generated commit messages — writes manually.',
    'Semantic understanding updated: user\'s definition of "quick task" implies < 5 minute execution.',
    'Episodic trace: user paused agent mid-execution to manually verify intermediate results.',
    'Procedural knowledge: deployment approval requires sign-off from at least two team members.',
    'Working context: user currently reviewing agent-generated schema migration plan for v4.0.',
    'Agent extracted key insight: user values data privacy over convenience in cloud integrations.',
    'Episodic record: user explicitly disabled telemetry after reading privacy policy update.',
    'Semantic memory: user\'s domain expertise identified as senior-level backend infrastructure.',
  ];
  return {
    id: `sem_${(i + 1).toString().padStart(4, '0')}`,
    type: types[i % 4],
    content: snippets[i] ?? 'Semantic memory entry with contextual embedding data.',
    similarity: 0.45 + Math.random() * 0.55,
    createdAt: new Date(Date.now() - i * 7200000 * (1 + Math.random())).toISOString(),
  };
});

export default function SemanticSearchPage() {
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<MemoryType | 'all'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const start = performance.now();

    const matched = CORPUS.filter((r) => {
      const matchesType = selectedType === 'all' || r.type === selectedType;
      const matchesQuery = r.content.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    }).sort((a, b) => b.similarity - a.similarity);

    const elapsed = performance.now() - start;
    setSearchTime(elapsed);
    return matched;
  }, [query, selectedType]);

  const handleSearch = () => {
    setIsSearching(true);
    setHasSearched(true);
    setTimeout(() => setIsSearching(false), 0);
  };

  const types: (MemoryType | 'all')[] = ['all', 'SEMANTIC', 'EPISODIC', 'PROCEDURAL', 'WORKING'];

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/10 px-3 py-1 text-xs text-purple-300">
          <Search className="h-3.5 w-3.5" />
          Neural Search
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Semantic Search Console</h1>
        <p className="mt-1 text-zinc-400">
          Query the vector knowledge base using natural language understanding.
        </p>
      </div>

      {/* SEARCH BAR */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Search Query
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search memories by semantic meaning..."
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/[0.07] bg-white/[0.01] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/30 focus:bg-white/[0.03] transition-all"
              />
            </div>
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || isSearching}
            className="flex h-11 items-center gap-2 rounded-xl bg-purple-500/20 px-5 text-sm font-semibold text-purple-300 border border-purple-500/20 hover:bg-purple-500/30 transition-all disabled:opacity-40"
          >
            {isSearching ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300 border-t-transparent" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </button>
        </div>

        {/* TYPE FILTERS */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4">
          <Filter className="h-3 w-3 text-zinc-600 mr-1" />
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all',
                selectedType === t
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/10'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
              )}
            >
              {t === 'all' ? 'All Types' : t}
            </button>
          ))}
        </div>
      </div>

      {/* RESULTS */}
      {hasSearched && (
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">Results</h2>
              <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-300">
                {results.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
              <Timer className="h-3 w-3" />
              {searchTime !== null && <span>{searchTime.toFixed(1)}ms</span>}
              {searchTime !== null && <span>·</span>}
              <Hash className="h-3 w-3" />
              <span>{CORPUS.length} indexed</span>
            </div>
          </div>

          <div className="space-y-2">
            {results.length > 0 ? (
              results.map((r, i) => {
                const meta = TYPE_META[r.type];
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.025 }}
                    className="group flex items-start gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-4 transition-all hover:border-white/[0.08] hover:bg-white/[0.01]"
                  >
                    <div className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', meta.bg, meta.color)}>
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={cn('rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider', meta.bg, meta.color)}>
                          {meta.label}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-600">{r.id}</span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed">{r.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                        <span className={cn(
                          'font-semibold',
                          r.similarity > 0.8 ? 'text-emerald-400' : r.similarity > 0.6 ? 'text-amber-400' : 'text-zinc-500',
                        )}>
                          similarity {(r.similarity * 100).toFixed(1)}%
                        </span>
                        <span>·</span>
                        <span>{timeAgo(r.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/[0.05]">
                        <span className={cn(
                          'text-[10px] font-black',
                          r.similarity > 0.8 ? 'text-emerald-400' : r.similarity > 0.6 ? 'text-amber-400' : 'text-zinc-500',
                        )}>
                          {(r.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/[0.05] rounded-2xl">
                <Search className="h-8 w-8 text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-500 font-semibold">No results found</p>
                <p className="text-xs text-zinc-600 mt-1">Try a different query or remove filters.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!hasSearched && (
        <div className="flex flex-col items-center justify-center py-16 rounded-[24px] border border-white/[0.05] bg-black/20">
          <BrainCircuit className="h-12 w-12 text-zinc-700 mb-4" />
          <p className="text-sm font-semibold text-zinc-500">Enter a query to search</p>
          <p className="text-xs text-zinc-600 mt-1">Semantic search across all memory types.</p>
        </div>
      )}
    </div>
    </Suspense></ErrorBoundary>
  );
}
