'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Shield, Globe, MousePointerClick, Type, FileText, Camera, Clock, AlertTriangle, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentPlan, PlannedStep } from '@/types/agent';

interface PlanPanelProps {
  plan: AgentPlan | null;
  currentStepIndex: number;
  phase: string;
}

const ACTION_ICONS: Record<string, React.ComponentType<any>> = {
  navigate: Globe,
  click: MousePointerClick,
  double_click: MousePointerClick,
  right_click: MousePointerClick,
  type: Type,
  select: Type,
  scroll: Globe,
  hover: MousePointerClick,
  press_key: Type,
  wait: Clock,
  screenshot: Camera,
  extract_text: FileText,
  extract_data: FileText,
  upload_file: FileText,
};

const RISK_COLORS: Record<string, string> = {
  LOW: 'border-l-emerald-500/50',
  MEDIUM: 'border-l-yellow-500/50',
  HIGH: 'border-l-orange-500/50',
  CRITICAL: 'border-l-red-500/50',
};

export function PlanPanel({ plan, currentStepIndex, phase }: PlanPanelProps) {
  const steps = plan?.steps || [];
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const completedCount = Math.min(currentStepIndex, steps.length);
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="relative rounded-3xl border border-white/10 bg-zinc-950/40 p-5 backdrop-blur-2xl transition-all shadow-2xl flex flex-col min-h-[420px] max-h-[500px]">
      <div className="absolute inset-0 cyber-grid opacity-5 rounded-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-red-400" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Execution Roadmap</h3>
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <>
              <span className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                {steps.length} STEPS
              </span>
              <span className={cn(
                "text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-widest",
                progressPercent === 100 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-zinc-400 border border-white/10"
              )}>
                {progressPercent}%
              </span>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {steps.length > 0 && (
        <div className="mb-4">
          <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-red-500"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ backgroundSize: '200% 100%' }}
            />
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 cyber-scroll relative">
        {/* Animated gradient timeline line */}
        {steps.length > 0 && (
          <div className="timeline-gradient-line left-[18px] top-0 bottom-0" />
        )}

        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-full py-12">
            <Shield className="h-10 w-10 text-zinc-700 animate-pulse mb-3" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">No active execution plan</span>
            <p className="text-[10px] text-zinc-600 mt-2 max-w-[200px]">Goal parser will compile steps here on deploy.</p>
          </div>
        ) : (
          steps.map((step, idx) => {
            const active = idx === currentStepIndex && phase === 'executing';
            const completed = idx < currentStepIndex;
            const failed = idx === currentStepIndex && phase === 'failed';
            const pending = idx > currentStepIndex;
            const isExpanded = expandedStep === idx;

            const Icon = ACTION_ICONS[step.action] || Shield;
            const riskBorder = RISK_COLORS[step.riskLevel] || '';

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={cn(
                  "relative flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer border-l-4",
                  riskBorder,
                  active && "border-red-500/30 bg-red-500/5 neon-glow-red",
                  completed && "border-white/5 bg-white/[0.01] opacity-60",
                  failed && "border-red-500/40 bg-red-950/20",
                  pending && "border-transparent opacity-40 hover:opacity-60"
                )}
                onClick={() => setExpandedStep(isExpanded ? null : idx)}
              >
                {/* Node */}
                <div
                  className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center border flex-shrink-0 text-xs font-bold font-mono z-10 bg-zinc-950",
                    active && "border-red-500/30 bg-red-500/10 text-red-400 animate-pulse",
                    completed && "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
                    failed && "border-red-600/30 bg-red-600/10 text-red-500",
                    pending && "border-white/10 bg-black/40 text-zinc-500"
                  )}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : failed ? <X className="h-3.5 w-3.5" /> : idx + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {step.action}
                    </span>

                    {step.riskLevel !== 'LOW' && (
                      <span className={cn(
                        "text-[8px] font-mono px-1 rounded font-bold uppercase border",
                        step.riskLevel === 'CRITICAL' && "bg-red-500/15 text-red-400 border-red-500/20",
                        step.riskLevel === 'HIGH' && "bg-orange-500/15 text-orange-400 border-orange-500/20",
                        step.riskLevel === 'MEDIUM' && "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
                      )}>
                        {step.riskLevel}
                      </span>
                    )}

                    {step.requiresApproval && (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    )}

                    {/* Expand indicator */}
                    <div className="ml-auto">
                      {isExpanded ? <ChevronUp className="h-3 w-3 text-zinc-500" /> : <ChevronDown className="h-3 w-3 text-zinc-600" />}
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-white mt-1 leading-snug">{step.description}</p>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 text-[9px] font-mono text-zinc-500 bg-black/40 border border-white/5 rounded-lg px-3 py-2 space-y-1">
                          {step.target && <div><span className="text-zinc-600">TARGET:</span> <span className="text-zinc-300">{step.target}</span></div>}
                          {step.value && <div><span className="text-zinc-600">VALUE:</span> <span className="text-zinc-300">{step.value}</span></div>}
                          <div><span className="text-zinc-600">APPROVAL:</span> <span className={step.requiresApproval ? 'text-amber-400' : 'text-zinc-500'}>{step.requiresApproval ? 'REQUIRED' : 'AUTO'}</span></div>
                          {step.waitCondition && <div><span className="text-zinc-600">WAIT:</span> <span className="text-zinc-300">{step.waitCondition.type} ({step.waitCondition.timeoutMs}ms)</span></div>}
                          {step.fallback && <div><span className="text-zinc-600">FALLBACK:</span> <span className="text-cyan-400">{step.fallback.action} — {step.fallback.description}</span></div>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
