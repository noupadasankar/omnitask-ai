'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle, ArrowRight, Activity } from 'lucide-react';
import { useAgentStore } from '@/store/agent.store';

export function VerificationResultPanel() {
  const { verificationResult, phase } = useAgentStore();

  if (!verificationResult || (phase !== 'completed' && phase !== 'failed' && phase !== 'cancelled')) {
    return null;
  }

  const {
    verified,
    score,
    confidence,
    summary,
    gaps = [],
    achievements = [],
    nextAction,
    reasoning,
    evidence,
  } = verificationResult;

  const actionsCount: Record<string, number> = evidence?.actionsCount || {};
  const evidenceEntries = Object.entries(actionsCount).filter(([, count]) => count > 0);
  const confidencePct = typeof confidence === 'number'
    ? Math.round(confidence * 100)
    : score;

  const formatPluginLabel = (id: string) => {
    const base = id.split('-')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  };

  const nextActionConfig = {
    accept: { label: 'Goal Accepted', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' },
    retry: { label: 'Retrying Plan', color: 'text-amber-400 border-amber-500/20 bg-amber-500/10' },
    replan: { label: 'Full Replanning Triggered', color: 'text-red-400 border-red-500/20 bg-red-500/10' },
    notify_user: { label: 'User Escalation Required', color: 'text-orange-400 border-orange-500/20 bg-orange-500/10' },
  }[nextAction as string] || { label: nextAction, color: 'text-zinc-400 border-white/5 bg-white/[0.02]' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative rounded-3xl border border-white/10 bg-zinc-950/50 p-6 backdrop-blur-2xl shadow-2xl overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.03] via-transparent to-transparent pointer-events-none" />
      
      {/* Panel Title */}
      <div className="flex items-center justify-between mb-5 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-red-500" />
          <h3 className="text-xs font-mono font-bold tracking-widest text-zinc-300 uppercase">
            Goal Intent Verification
          </h3>
        </div>
        
        {/* Next Action Badge */}
        <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-bold font-mono tracking-wider uppercase ${nextActionConfig.color}`}>
          {nextActionConfig.label}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Card: Score Gauge */}
        <div className="flex flex-col items-center justify-center p-4 rounded-2xl border border-white/5 bg-black/40 text-center">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">INTENT SCORE</span>
          
          <div className="relative h-24 w-24 flex items-center justify-center">
            {/* SVG circle */}
            <svg width="96" height="96" className="transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="6"
              />
              <motion.circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke={verified ? '#10b981' : '#ef4444'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                animate={{ strokeDashoffset: (2 * Math.PI * 40) - (score / 100) * (2 * Math.PI * 40) }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-white">{score}</span>
              <span className="text-[8px] font-mono text-zinc-500">MAX 100</span>
            </div>
          </div>

          <div className="mt-4">
            <span className={`text-xs font-bold font-mono uppercase tracking-wider ${verified ? 'text-emerald-400' : 'text-red-400'}`}>
              {verified ? 'VERIFIED PASSED' : 'VERIFICATION FAILED'}
            </span>
            <p className="text-[10px] font-mono text-zinc-500 mt-1">Confidence: {confidencePct}%</p>
          </div>
        </div>

        {/* Evidence breakdown — per-site action counts */}
        {evidenceEntries.length > 0 && (
          <div className="md:col-span-3 p-4 rounded-2xl border border-white/5 bg-black/40">
            <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" />
              Execution Evidence
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {evidenceEntries.map(([pluginId, count]) => (
                <div
                  key={pluginId}
                  className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03]"
                >
                  <span className="text-xs font-bold text-white">{formatPluginLabel(pluginId)}</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right Details Container */}
        <div className="md:col-span-2 space-y-4">
          <div>
            <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Verdict Summary</div>
            <div className="text-sm font-bold text-white">{summary}</div>
          </div>

          <div>
            <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Reasoning Analysis</div>
            <div className="text-xs text-zinc-400 leading-relaxed max-h-24 overflow-y-auto pr-2">{reasoning}</div>
          </div>

          {/* Gaps & Achievements */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Achievements */}
            <div className="space-y-2">
              <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Achievements</div>
              <ul className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {achievements.length > 0 ? (
                  achievements.map((item: string, idx: number) => (
                    <li key={idx} className="flex gap-2 items-start text-xs text-zinc-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-zinc-600 italic font-mono">No specific accomplishments registered</li>
                )}
              </ul>
            </div>

            {/* Gaps */}
            <div className="space-y-2">
              <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest text-red-400">Identified Gaps</div>
              <ul className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {gaps.length > 0 ? (
                  gaps.map((item: string, idx: number) => (
                    <li key={idx} className="flex gap-2 items-start text-xs text-zinc-300">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-emerald-500 italic font-mono flex gap-1 items-center">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Zero gaps detected
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
