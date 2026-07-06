'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, CheckCircle, ShieldAlert, Camera, Activity, Filter, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelineEntry } from '@/store/agent.store';

interface ActionTimelineProps {
  timeline: TimelineEntry[];
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  step: Bot,
  approval: ShieldAlert,
  screenshot: Camera,
  event: Activity,
  agent: Bot,
};

const TYPE_COLORS: Record<string, string> = {
  step: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  approval: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  screenshot: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  event: 'text-red-400 bg-red-500/10 border-red-500/20',
  agent: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

type FilterType = 'all' | 'step' | 'approval' | 'event';

export function ActionTimeline({ timeline }: ActionTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current && autoScroll) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [timeline, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      setAutoScroll(isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredTimeline = timeline.filter(entry => {
    if (filter === 'all') return true;
    return entry.type === filter;
  });

  const typeCounts = {
    step: timeline.filter(t => t.type === 'step').length,
    approval: timeline.filter(t => t.type === 'approval').length,
    event: timeline.filter(t => t.type === 'event' || t.type === 'screenshot').length,
  };

  return (
    <div className="relative rounded-3xl border border-white/10 bg-zinc-950/40 p-5 backdrop-blur-2xl transition-all shadow-2xl flex flex-col min-h-[300px] max-h-[360px]">
      <div className="absolute inset-0 cyber-grid opacity-5 rounded-3xl pointer-events-none" />

      {/* Header with filter */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-red-400" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Action Ledger</h3>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Filter pills */}
          {(['all', 'step', 'approval', 'event'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2 py-0.5 rounded text-[8px] font-bold uppercase font-mono border transition-all",
                filter === f
                  ? "border-red-500/20 bg-red-500/10 text-red-400"
                  : "border-transparent text-zinc-600 hover:text-zinc-400"
              )}
            >
              {f}
              {f !== 'all' && (
                <span className="ml-1 text-zinc-600">{typeCounts[f as keyof typeof typeCounts] || 0}</span>
              )}
            </button>
          ))}

          {/* Auto-scroll indicator */}
          <div className={cn(
            "h-5 w-5 rounded flex items-center justify-center border transition-all ml-1",
            autoScroll
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-white/5 bg-white/[0.02] text-zinc-600"
          )}>
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div ref={containerRef} className="flex-1 overflow-y-auto pr-1 space-y-3 cyber-scroll">
        {filteredTimeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-full py-12">
            <Activity className="h-9 w-9 text-zinc-700 animate-pulse mb-3" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
              {filter === 'all' ? 'Awaiting execution...' : `No ${filter} events`}
            </span>
          </div>
        ) : (
          <div className="relative pl-6 space-y-3">
            {/* Animated gradient timeline line */}
            <div className="timeline-gradient-line left-[13px] top-0 bottom-0" />

            <AnimatePresence initial={false}>
              {filteredTimeline.map((entry) => {
                const Icon = TYPE_ICONS[entry.type] || Activity;
                const colors = TYPE_COLORS[entry.type] || 'text-zinc-400 bg-white/5 border-white/10';
                const isExpanded = expandedId === entry.id;

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative flex items-start gap-3 p-3 rounded-2xl border border-white/5 bg-black/30 backdrop-blur-xl cursor-pointer hover:border-white/10 transition-all"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    {/* Node dot */}
                    <div
                      className={cn(
                        "absolute -left-6 top-5 h-3 w-3 rounded-full border-2 bg-zinc-950 z-10",
                        entry.status === 'completed' && "border-emerald-500",
                        entry.status === 'failed' && "border-red-500",
                        entry.status === 'running' && "border-red-400 animate-pulse",
                        entry.status === 'waiting_approval' && "border-amber-500 animate-pulse",
                        entry.status === 'pending' && "border-white/20"
                      )}
                    >
                      <span className={cn(
                        "absolute inset-0.5 rounded-full",
                        entry.status === 'completed' && "bg-emerald-500",
                        entry.status === 'failed' && "bg-red-500",
                        entry.status === 'running' && "bg-red-400",
                        entry.status === 'waiting_approval' && "bg-amber-500",
                        entry.status === 'pending' && "bg-zinc-700"
                      )} />
                    </div>

                    {/* Icon */}
                    <div className={cn("h-8 w-8 rounded-xl border flex items-center justify-center flex-shrink-0", colors)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-bold text-white leading-snug truncate">{entry.title}</h4>
                        <span className="text-[9px] font-mono text-zinc-500 flex-shrink-0 tabular-nums">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">{entry.description}</p>

                      {/* Expanded metadata */}
                      <AnimatePresence>
                        {isExpanded && entry.metadata && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 text-[9px] font-mono text-zinc-500 bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 space-y-0.5">
                              {Object.entries(entry.metadata).map(([key, value]) => (
                                <div key={key}>
                                  <span className="text-zinc-600">{key.toUpperCase()}:</span>{' '}
                                  <span className="text-zinc-300">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
