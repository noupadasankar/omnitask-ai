'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Gauge, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAgentStore } from '@/store/agent.store';

export function CognitiveStatePanel() {
  const { cognitiveState, phase } = useAgentStore();
  const { reasoning, confidence, isReplanning } = cognitiveState;

  if (phase === 'idle') return null;

  const confPercent = Math.round(confidence * 100);
  
  // Custom theme colors for confidence levels
  const confColorClass =
    confPercent >= 85
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : confPercent >= 70
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-red-400 bg-red-500/10 border-red-500/20';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl border border-white/5 bg-zinc-950/45 p-6 backdrop-blur-2xl shadow-2xl overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.02] via-transparent to-transparent pointer-events-none" />
      
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-5 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-red-500 animate-pulse" />
          <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-300 uppercase">
            Cognitive Processing State
          </h3>
        </div>
        
        {/* Replanning Pulse Badge */}
        <AnimatePresence>
          {isReplanning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-[9px] font-bold font-mono text-amber-400 animate-pulse"
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              DYNAMIC REPLANNING ACTIVE
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-4">
        {/* Step Reasoning */}
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
            Active Reasoning (Step Objective)
          </div>
          <div className="rounded-xl bg-black/45 border border-white/5 p-4 text-sm font-semibold text-white/90 leading-relaxed shadow-inner">
            {reasoning ? (
              <div className="flex gap-2 items-start">
                <Sparkles className="h-4.5 w-4.5 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{reasoning}</span>
              </div>
            ) : (
              <div className="text-zinc-500 italic font-mono text-xs">
                Awaiting next command cycle or planning sequence...
              </div>
            )}
          </div>
        </div>

        {/* Confidence Meter */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center pt-2">
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 tracking-wider">
              <span>PATH CONFIDENCE METRIC</span>
              <span className="font-bold text-white">{confPercent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/[0.04] overflow-hidden p-0.5 border border-white/5">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
                initial={{ width: 0 }}
                animate={{ width: `${confPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Confidence Badge */}
          <div className="flex justify-end md:justify-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold font-mono tracking-wider ${confColorClass} shadow-md`}>
              <Gauge className="h-4 w-4 flex-shrink-0" />
              {confPercent >= 85 ? 'STABLE' : confPercent >= 70 ? 'MODERATE' : 'CRITICAL'}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
