'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckCircle2, XCircle, Clock, Loader2, ArrowRight,
  Search, Activity, Calendar, RefreshCw, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExecutionHistory } from '@/hooks/useRuntimeData';

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  COMPLETED:        { label: 'Completed', color: 'text-emerald-400', dot: 'bg-emerald-500' },
  FAILED:           { label: 'Failed',    color: 'text-red-400',     dot: 'bg-red-500'     },
  CANCELLED:        { label: 'Cancelled', color: 'text-zinc-500',    dot: 'bg-zinc-600'    },
  RUNNING:          { label: 'Running',   color: 'text-blue-400',    dot: 'bg-blue-500'    },
  PLANNING:         { label: 'Planning',  color: 'text-purple-400',  dot: 'bg-purple-500'  },
  PAUSED:           { label: 'Paused',    color: 'text-amber-400',   dot: 'bg-amber-500'   },
  WAITING_APPROVAL: { label: 'Awaiting',  color: 'text-orange-400',  dot: 'bg-orange-500'  },
  PENDING:          { label: 'Pending',   color: 'text-zinc-400',    dot: 'bg-zinc-500'    },
};

function groupByDate(sessions: any[]) {
  const groups: Record<string, any[]> = {};
  for (const s of sessions) {
    const d = new Date(s.startedAt ?? s.createdAt);
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return groups;
}

function goalText(s: any) {
  return s.plan?.goal || s.goal || s.naturalLanguage || `Session ${s.id.slice(0, 8)}`;
}

function fmtDuration(s: any) {
  if (!s.startedAt) return null;
  const start = new Date(s.startedAt).getTime();
  const end = s.completedAt ? new Date(s.completedAt).getTime() : Date.now();
  const sec = Math.floor((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryPage() {
  const router = useRouter();
  const { data: sessions = [], isLoading, isFetching, refetch } = useExecutionHistory();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return [...sessions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((s) => {
        const matchStatus = statusFilter === 'all' || s.status === statusFilter;
        const matchSearch = !search ||
          goalText(s).toLowerCase().includes(search.toLowerCase()) ||
          s.id.toLowerCase().includes(search.toLowerCase());
        return matchStatus && matchSearch;
      });
  }, [sessions, search, statusFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: sessions.length };
    for (const s of sessions) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [sessions]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <Calendar className="h-3.5 w-3.5 text-red-400" />
            Activity Log
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">History</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Chronological log of all agent executions — click any entry to open in dashboard.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
          {['all', 'COMPLETED', 'FAILED', 'CANCELLED', 'RUNNING'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                statusFilter === s ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {s === 'all' ? 'All' : (STATUS_META[s]?.label ?? s)}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                statusFilter === s ? 'bg-red-500/20 text-red-300' : 'bg-white/[0.04] text-zinc-600',
              )}>
                {statusCounts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex items-center sm:ml-auto">
          <Search className="absolute left-3 h-4 w-4 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions…"
            className="h-9 w-52 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <span className="ml-3 text-sm text-zinc-500">Loading history…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20 py-20 text-center">
          <Activity className="mb-4 h-10 w-10 text-zinc-700" />
          <p className="text-sm font-semibold text-zinc-500">No sessions found</p>
          <p className="mt-1 text-xs text-zinc-600">Run a task from the Dashboard to see activity here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, items], gi) => (
            <motion.div
              key={date}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.06 }}
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-600">{date}</span>
                <div className="h-px flex-1 bg-white/[0.05]" />
                <span className="text-[10px] text-zinc-700">{items.length} runs</span>
              </div>

              <div className="relative pl-6">
                <div className="absolute bottom-0 left-2 top-0 w-px bg-white/[0.05]" />
                <div className="space-y-2">
                  {items.map((s, i) => {
                    const meta = STATUS_META[s.status] ?? STATUS_META.PENDING;
                    const dur = fmtDuration(s);
                    return (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: gi * 0.06 + i * 0.03 }}
                        onClick={() => router.push(`/dashboard?session=${s.id}`)}
                        className="group relative flex cursor-pointer items-center gap-4 rounded-2xl border border-white/[0.07] bg-transparent px-5 py-4 transition-all hover:border-white/20 hover:bg-white/[0.03]"
                      >
                        <div className={cn('absolute -left-[18px] h-2.5 w-2.5 rounded-full ring-2 ring-black', meta.dot)} />
                        <span className="w-14 flex-shrink-0 font-mono text-[10px] text-zinc-600">
                          {fmtTime(s.startedAt ?? s.createdAt)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{goalText(s)}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
                            {s.totalSteps > 0 ? `${s.currentStepIndex}/${s.totalSteps} steps` : 'No steps recorded'}
                          </p>
                        </div>
                        {dur && (
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                            <Clock className="h-3 w-3" />
                            {dur}
                          </div>
                        )}
                        <span className={cn('text-[10px] font-bold', meta.color)}>{meta.label}</span>
                        {s.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500/60" />
                        ) : s.status === 'FAILED' ? (
                          <XCircle className="h-4 w-4 flex-shrink-0 text-red-500/60" />
                        ) : s.status === 'CANCELLED' ? (
                          <Ban className="h-4 w-4 flex-shrink-0 text-zinc-600" />
                        ) : (
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
