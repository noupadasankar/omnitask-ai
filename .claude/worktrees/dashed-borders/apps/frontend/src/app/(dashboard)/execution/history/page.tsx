'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { History, Play, CheckCircle, XCircle, Search, Calendar, ChevronRight, Cpu } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getUserHistory } from '@/services/agent.service';

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'FAILED' | 'CANCELLED'>('ALL');

  useEffect(() => {
    async function load() {
      try {
        const data = await getUserHistory();
        setHistory(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredHistory = history.filter((item) => {
    const goalText = (item.metadata as any)?.goal || item.naturalLanguage || '';
    const matchesSearch = goalText.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filter === 'ALL') return matchesSearch;
    return item.status === filter && matchesSearch;
  });

  return (
    <div className="relative flex flex-col gap-6 p-6 min-h-screen text-white bg-black">
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />

      {/* Header Banner */}
      <header className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center">
            <History className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-wider text-white">Execution History Ledger</h1>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest mt-0.5">HISTORICAL WORKFLOW TELEMETRY</p>
          </div>
        </div>

        <Link href="/dashboard">
          <button className="h-9 px-4 rounded-xl border border-red-500/25 bg-red-500/10 text-xs font-bold font-mono text-red-400 hover:bg-red-500/20 transition-all">
            ← MISSION CONTROL
          </button>
        </Link>
      </header>

      {/* Filter Control Bar */}
      <section className="relative z-10 flex flex-col sm:flex-row gap-4 items-center justify-between p-4 rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl">
        {/* Search */}
        <div className="relative flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 w-full sm:max-w-xs focus-within:border-red-500/30">
          <Search className="h-4 w-4 text-zinc-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search objectives..."
            className="bg-transparent text-xs font-semibold text-white outline-none w-full"
          />
        </div>

        {/* Status filters */}
        <div className="flex gap-1 bg-black/40 border border-white/5 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
          {(['ALL', 'COMPLETED', 'FAILED', 'CANCELLED'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all flex-shrink-0",
                filter === opt
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : "border-transparent text-zinc-500 hover:text-white"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </section>

      {/* Catalog Grid */}
      <section className="relative z-10 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Cpu className="h-8 w-8 text-red-500 animate-spin mb-3" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">RETRIEVING LEDGER DATA...</span>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center border border-white/5 rounded-3xl bg-zinc-950/20 py-24">
            <History className="h-10 w-10 text-zinc-700 mb-3" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">No historical workflows found</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredHistory.map((run) => {
              const goal = (run.metadata as any)?.goal || 'Autonomous run';
              const date = new Date(run.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
              
              const isCompleted = run.status === 'COMPLETED';
              const isFailed = run.status === 'FAILED';

              const thumbnail = run.screenshots?.[0]?.imageUrl || run.screenshots?.[0]?.base64Thumbnail;

              return (
                <motion.div
                  key={run.id}
                  whileHover={{ y: -3 }}
                  className="rounded-3xl border border-white/5 bg-zinc-950/40 p-5 flex flex-col justify-between min-h-[220px] transition-all hover:border-white/10 relative overflow-hidden"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {date}
                      </span>

                      <span
                        className={cn(
                          "text-[8px] font-mono font-bold uppercase px-2 py-0.5 rounded border",
                          isCompleted && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          isFailed && "bg-red-500/10 text-red-400 border-red-500/20",
                          run.status === 'CANCELLED' && "bg-zinc-800 text-zinc-400 border-zinc-700"
                        )}
                      >
                        {run.status}
                      </span>
                    </div>

                    {/* Goal */}
                    <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">{goal}</h3>
                    
                    {/* Screenshot thumbnail if available */}
                    {thumbnail ? (
                      <div className="rounded-xl border border-white/5 overflow-hidden h-24 bg-black relative">
                        <img src={thumbnail.startsWith('data:') ? thumbnail : `data:image/jpeg;base64,${thumbnail}`} alt="Thumbnail" className="w-full h-full object-cover opacity-60" />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/5 h-24 bg-black/40 flex items-center justify-center text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
                        NO CAPTURED THUMBNAIL
                      </div>
                    )}
                  </div>

                  {/* Playback footer */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-4">
                    <span className="text-[10px] font-mono text-zinc-500">ID: {run.id.slice(0, 12)}...</span>
                    
                    <Link href={`/execution/replay/${run.id}`}>
                      <button className="h-8 px-3 rounded-lg bg-red-500 text-[10px] font-bold text-white transition-all hover:scale-105 hover:shadow-[0_0_10px_rgba(239,68,68,0.4)] flex items-center gap-1.5">
                        <Play className="h-3 w-3" />
                        PLAYBACK REPLAY
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
