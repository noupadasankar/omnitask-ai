'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Trash2, Search, Download, Copy, Check, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/store/agent.store';

interface LogPanelProps {
  logs: LogEntry[];
  onClear?: () => void;
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'success'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [compact, setCompact] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filter !== 'all' && log.level !== filter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return log.message.toLowerCase().includes(q) || log.source.toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, filter, searchQuery]);

  // Log level counts
  const levelCounts = useMemo(() => ({
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
    success: logs.filter(l => l.level === 'success').length,
  }), [logs]);

  const copyLog = (log: LogEntry) => {
    const text = `[${new Date(log.timestamp).toISOString()}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(log.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const exportLogs = () => {
    const text = logs.map(log =>
      `[${new Date(log.timestamp).toISOString()}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`
    ).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnitask-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlightMatch = (text: string) => {
    if (!searchQuery) return text;
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="search-match">{text.slice(idx, idx + searchQuery.length)}</span>
        {text.slice(idx + searchQuery.length)}
      </>
    );
  };

  return (
    <div className={cn(
      "relative rounded-3xl border border-white/10 bg-zinc-950/90 p-5 backdrop-blur-2xl transition-all shadow-2xl flex flex-col min-h-[300px] max-h-[360px] font-mono",
      compact ? "log-compact" : "log-expanded"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="h-4 w-4 text-red-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider">Telemetry Console</span>
          <span className="text-[9px] text-zinc-600">({logs.length})</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Search toggle */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-lg border transition-all",
              showSearch
                ? "border-red-500/20 bg-red-500/10 text-red-400"
                : "border-white/5 bg-white/[0.02] text-zinc-500 hover:text-white"
            )}
          >
            <Search className="h-3.5 w-3.5" />
          </button>

          {/* Compact toggle */}
          <button
            onClick={() => setCompact(!compact)}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-zinc-500 hover:text-white transition-all"
          >
            {compact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </button>

          {/* Export */}
          <button
            onClick={exportLogs}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-zinc-500 hover:text-white transition-all"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {/* Clear */}
          {onClear && (
            <button
              onClick={onClear}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-zinc-500 hover:text-red-400 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-white/5 mx-0.5" />

          {/* Filter buttons with counts */}
          {(['all', 'info', 'warn', 'error', 'success'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={cn(
                "px-2 py-1 rounded text-[9px] font-bold uppercase border transition-all",
                filter === lvl
                  ? "border-red-500/20 bg-red-500/10 text-red-400"
                  : "border-transparent text-zinc-600 hover:text-white"
              )}
            >
              {lvl}
              {lvl !== 'all' && levelCounts[lvl] > 0 && (
                <span className={cn(
                  "ml-0.5 text-[7px]",
                  lvl === 'error' ? "text-red-500" : lvl === 'warn' ? "text-yellow-500" : ""
                )}>
                  {levelCounts[lvl]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-2"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/5">
              <Search className="h-3 w-3 text-zinc-500 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="flex-1 bg-transparent text-[10px] text-white outline-none placeholder-zinc-600"
                autoFocus
              />
              {searchQuery && (
                <span className="text-[9px] text-zinc-500">{filteredLogs.length} matches</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto pr-1 space-y-1 select-text selection:bg-red-500/30 font-mono text-zinc-300 cyber-scroll"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-full text-zinc-600 py-12">
            <span>[ {searchQuery ? 'NO MATCHING ENTRIES' : 'SYSTEM MONITOR READY'} ]</span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

            return (
              <div
                key={log.id}
                className={cn(
                  "log-entry group flex items-start gap-2 py-1 px-2 rounded hover:bg-white/[0.02] border border-transparent hover:border-white/5 transition-all",
                  log.level === 'error' && "text-red-400 bg-red-950/10",
                  log.level === 'warn' && "text-yellow-400 bg-yellow-950/10",
                  log.level === 'success' && "text-emerald-400 bg-emerald-950/10"
                )}
              >
                <span className="text-zinc-600 select-none flex-shrink-0 text-[10px]">[{timeStr}]</span>

                <span className={cn(
                  "text-[9px] font-bold uppercase select-none px-1 rounded flex-shrink-0",
                  log.level === 'info' && "bg-blue-500/10 text-blue-400",
                  log.level === 'warn' && "bg-yellow-500/10 text-yellow-400",
                  log.level === 'error' && "bg-red-500/10 text-red-400",
                  log.level === 'success' && "bg-emerald-500/10 text-emerald-400",
                  log.level === 'debug' && "bg-zinc-800 text-zinc-500"
                )}>
                  {log.level}
                </span>

                <span className="text-zinc-500 select-none font-bold flex-shrink-0 text-[10px]">
                  [{log.source.toUpperCase()}]
                </span>

                <span className="break-all whitespace-pre-wrap flex-1 text-[11px]">{highlightMatch(log.message)}</span>

                {/* Copy button */}
                <button
                  onClick={(e) => { e.stopPropagation(); copyLog(log); }}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 h-5 w-5 flex items-center justify-center rounded text-zinc-600 hover:text-white transition-all"
                >
                  {copiedId === log.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
