'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Search,
  BrainCircuit,
  BookOpen,
  GitBranch,
  Layers,
  Trash2,
  Loader2,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/utils';
import { agentsApi } from '@/lib/api';

interface Memory {
  id: string;
  type: 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL';
  key: string;
  content: string;
  importance: number;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
}

const MEMORY_TYPES = ['ALL', 'EPISODIC', 'SEMANTIC', 'PROCEDURAL'] as const;

const TYPE_STYLE: Record<string, { icon: any; color: string; bg: string; border: string }> = {
  EPISODIC: { icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  SEMANTIC: { icon: BrainCircuit, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  PROCEDURAL: { icon: GitBranch, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
};

const MOCK_MEMORIES: Memory[] = Array.from({ length: 20 }, (_, i) => {
  const types: Memory['type'][] = ['EPISODIC', 'SEMANTIC', 'PROCEDURAL'];
  const type = types[i % 3];
  return {
    id: `mem-${i}`,
    type,
    key: type === 'EPISODIC' ? `Session-${String(i + 1).padStart(3, '0')}` : type === 'SEMANTIC' ? 'user.preferences.domain' : 'action.click.submit',
    content: type === 'EPISODIC'
      ? `Completed job application for Software Engineer position at Acme Corp`
      : type === 'SEMANTIC'
        ? 'User prefers fast execution, minimal confirmations for low-risk actions'
        : 'To submit a form: locate submit button, wait for enabled state, click, wait for navigation',
    importance: Math.round((Math.random() * 9 + 1) * 10) / 10,
    accessCount: Math.floor(Math.random() * 50),
    lastAccessedAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
    createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
  };
});

export default function AgentMemoryPage() {
  const params = useParams();
  const id = params.id as string;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    agentsApi
      .get(id)
      .then(() => setMemories(MOCK_MEMORIES))
      .catch(() => setMemories(MOCK_MEMORIES))
      .finally(() => setLoading(false));
  }, [id]);

  const filtered = useMemo(() => {
    return memories.filter((m) => {
      if (typeFilter !== 'ALL' && m.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.key.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
      }
      return true;
    });
  }, [memories, search, typeFilter]);

  const handleDelete = async (memoryId: string) => {
    setDeleting(memoryId);
    await new Promise((r) => setTimeout(r, 400));
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-red-400" />
        <p className="mt-3 text-sm text-zinc-500">Loading memories...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(['EPISODIC', 'SEMANTIC', 'PROCEDURAL'] as const).map((type) => {
          const count = memories.filter((m) => m.type === type).length;
          const style = TYPE_STYLE[type];
          const Icon = style.icon;
          return (
            <div key={type} className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3', style.border, style.bg)}>
              <Icon className={cn('h-4 w-4', style.color)} />
              <div>
                <p className={cn('text-[11px] font-semibold uppercase tracking-wider', style.color)}>{type}</p>
                <p className="text-lg font-bold text-white">{count}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="h-10 w-full rounded-xl border border-white/[0.07] bg-black pl-10 pr-4 text-xs text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {MEMORY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium transition-all whitespace-nowrap',
                typeFilter === t
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
              )}
            >
              {t === 'ALL' && <Layers className="h-3.5 w-3.5" />}
              {t !== 'ALL' && React.createElement(TYPE_STYLE[t].icon, { className: 'h-3.5 w-3.5' })}
              {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Memory list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-16 text-center">
          <BrainCircuit className="h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-400">No memories found</p>
          <p className="mt-1 text-xs text-zinc-600">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((memory, i) => {
            const style = TYPE_STYLE[memory.type];
            const Icon = style.icon;
            return (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="group relative rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/15"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl border', style.bg, style.border)}>
                      <Icon className={cn('h-4 w-4', style.color)} />
                    </div>
                    <div>
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider', style.color)}>
                        {memory.type}
                      </span>
                      <p className="text-[11px] font-mono text-zinc-500 truncate max-w-[180px]">{memory.key}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(memory.id)}
                    disabled={deleting === memory.id}
                    className="opacity-0 group-hover:opacity-100 transition-all rounded-lg p-1.5 hover:bg-red-500/10"
                  >
                    {deleting === memory.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-zinc-500 hover:text-red-400 transition-colors" />
                    )}
                  </button>
                </div>

                <p className="mb-4 text-xs leading-relaxed text-zinc-400 line-clamp-3">{memory.content}</p>

                {/* Importance bar */}
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                      <Star className="h-3 w-3" />
                      Importance
                    </div>
                    <span className="text-[10px] font-semibold text-white">{memory.importance.toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(memory.importance / 10) * 100}%`,
                        background: memory.importance > 7
                          ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                          : memory.importance > 4
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #6b7280, #4b5563)',
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.05] pt-3 text-[10px] text-zinc-600">
                  <span>Accessed {memory.accessCount} times</span>
                  <span>{timeAgo(memory.createdAt)}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
    </Suspense></ErrorBoundary>
  );
}
