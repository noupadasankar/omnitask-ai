'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Lightbulb, TrendingUp, AlertCircle, Bookmark } from 'lucide-react';
import { useAgentStore } from '@/store/agent.store';

export function StrategyMemoryPanel() {
  const { recalledStrategies, phase } = useAgentStore();

  if (phase === 'idle') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl border border-white/5 bg-zinc-950/45 p-6 backdrop-blur-2xl shadow-2xl overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.01] via-transparent to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-red-500" />
          <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-300 uppercase">
            Recalled Strategy Memory
          </h3>
        </div>
        
        <div className="text-[9px] font-mono text-zinc-500 uppercase">
          LEARNED CROSS-SESSION
        </div>
      </div>

      {/* Strategy List */}
      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
        <AnimatePresence mode="wait">
          {recalledStrategies && recalledStrategies.length > 0 ? (
            recalledStrategies.map((strategy: any, idx: number) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ delay: idx * 0.1 }}
                className="rounded-2xl border border-white/5 bg-black/40 p-4 space-y-3 relative hover:border-red-500/20 transition-all group"
              >
                {/* Relevance score badge */}
                <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                  <TrendingUp className="h-3 w-3" />
                  {Math.round((strategy.relevance || strategy.relevanceScore || 0) * 100)}% REL
                </div>

                <div className="flex gap-2 items-center">
                  <Bookmark className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <span className="text-xs font-bold text-white uppercase tracking-wide">
                    {strategy.approach ? 'Execution Pattern' : 'Historical Strategy'}
                  </span>
                </div>

                <div className="text-xs font-medium text-zinc-300 leading-relaxed pl-6 border-l border-white/5">
                  {strategy.approach || strategy.pattern?.effectiveApproach}
                </div>

                {/* Meta details */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[9px] font-mono text-zinc-500 pl-6">
                  {strategy.pattern?.avgSteps && (
                    <span>STEPS: <span className="text-zinc-300 font-bold">{strategy.pattern.avgSteps}</span></span>
                  )}
                  {strategy.pattern?.skillsUsed && strategy.pattern.skillsUsed.length > 0 && (
                    <span className="truncate">
                      SKILLS: <span className="text-zinc-300 font-bold">{strategy.pattern.skillsUsed.join(', ')}</span>
                    </span>
                  )}
                </div>
              </motion.div>
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <Lightbulb className="h-8 w-8 text-zinc-600 mb-2 animate-pulse" />
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                No Strategy Recalled
              </div>
              <div className="text-[10px] text-zinc-600 mt-1 max-w-[200px] leading-relaxed">
                Recalls strategy memories dynamically when goal intent matches past successful sessions.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
