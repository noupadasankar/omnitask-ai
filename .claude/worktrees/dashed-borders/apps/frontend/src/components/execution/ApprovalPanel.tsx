'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Check, X, Clock, AlertTriangle, Keyboard, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovalRequest } from '@/types/agent';

interface ApprovalPanelProps {
  pendingApproval: ApprovalRequest | null;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

export function ApprovalPanel({ pendingApproval, onApprove, onDeny }: ApprovalPanelProps) {
  const [timeLeft, setTimeLeft] = useState(300);
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!pendingApproval) {
      setTimeLeft(300);
      setIsUrgent(false);
      return;
    }

    const expiresTime = new Date(pendingApproval.expiresAt).getTime();

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      setIsUrgent(remaining < 30 && remaining > 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [pendingApproval]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!pendingApproval) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onApprove(pendingApproval.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDeny(pendingApproval.id);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pendingApproval, onApprove, onDeny]);

  if (!pendingApproval) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const isCritical = pendingApproval.riskLevel === 'CRITICAL';
  const isHigh = pendingApproval.riskLevel === 'HIGH' || isCritical;
  const isGate = !!pendingApproval.gate;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className={cn(
          "w-full relative z-30 rounded-3xl border bg-zinc-950/95 p-6 backdrop-blur-2xl transition-all flex flex-col md:flex-row items-center justify-between gap-6 hazard-stripe hazard-stripe-bottom",
          isCritical && "border-red-500/30 neon-glow-red-intense",
          isHigh && !isCritical && "border-orange-500/25 neon-glow-amber",
          !isHigh && "border-yellow-500/20",
          isUrgent && "shake-urgent"
        )}
      >
        <div className="flex items-start gap-4">
          {/* Risk Level Icon with pulse */}
          <div
            className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center border flex-shrink-0 pulse-ring",
              isCritical && "border-red-500 bg-red-500/10 text-red-500",
              isHigh && !isCritical && "border-orange-500 bg-orange-500/10 text-orange-500",
              !isHigh && "border-yellow-500 bg-yellow-500/10 text-yellow-500"
            )}
          >
            {isGate ? <Rocket className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
          </div>

          <div className="space-y-1.5 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {isGate ? 'BROWSER LAUNCH AUTHORIZATION' : 'VERIFICATION REQUIRED'}
              </span>
              <span
                className={cn(
                  "text-[8px] font-mono px-1.5 rounded font-bold uppercase border",
                  isCritical && "bg-red-500/15 text-red-400 border-red-500/20",
                  isHigh && !isCritical && "bg-orange-500/15 text-orange-400 border-orange-500/20",
                  !isHigh && "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
                )}
              >
                {pendingApproval.riskLevel} RISK
              </span>

              {/* Waveform urgency indicator */}
              <div className={cn("waveform-bars", isCritical ? "text-red-500" : isHigh ? "text-orange-500" : "text-yellow-500")}>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="waveform-bar" />
                ))}
              </div>
            </div>

            <h3 className="text-sm font-bold text-white leading-snug">
              {isGate
                ? (pendingApproval.actionDetails?.description || 'Authorize browser launch')
                : (pendingApproval.actionDetails?.description || 'Sensitive page operation intercepted')}
            </h3>

            {isGate ? (
              <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
                No browser is open yet. Approving launches a sandboxed Chromium session and begins live automation
                {pendingApproval.targetDomains?.length ? (
                  <> on <span className="font-mono text-zinc-300 bg-black/40 px-1.5 py-0.5 rounded text-[11px]">{pendingApproval.targetDomains.join(', ')}</span></>
                ) : null}
                . You can pause or stop at any time.
              </p>
            ) : (
              <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
                Action: <span className="font-mono text-zinc-300 bg-black/40 px-1.5 py-0.5 rounded text-[11px]">{pendingApproval.actionDetails?.action}</span>
                {pendingApproval.actionDetails?.target && (
                  <> on <span className="font-mono text-zinc-300 bg-black/40 px-1.5 py-0.5 rounded text-[11px]">{pendingApproval.actionDetails.target}</span></>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-shrink-0 w-full md:w-auto justify-end">
          {/* Countdown */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs",
            isUrgent
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : "bg-black/40 border-white/5 text-zinc-400"
          )}>
            <Clock className={cn("h-3.5 w-3.5", isUrgent && "animate-pulse")} />
            <span className="tabular-nums">{timeFormatted}</span>
          </div>

          {/* Deny */}
          <button
            onClick={() => onDeny(pendingApproval.id)}
            className="flex h-11 px-5 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-bold text-zinc-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-white transition-all active:scale-95"
          >
            <X className="h-4 w-4" />
            DENY
            <span className="text-[8px] font-mono opacity-50 ml-0.5">[ESC]</span>
          </button>

          {/* Approve */}
          <button
            onClick={() => onApprove(pendingApproval.id)}
            className="flex h-11 px-5 items-center justify-center gap-2 rounded-xl bg-red-500 text-xs font-bold text-white transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] active:scale-95"
          >
            {isGate ? <Rocket className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {isGate ? 'APPROVE & LAUNCH' : 'APPROVE'}
            <span className="text-[8px] font-mono opacity-60 ml-0.5">[ENTER]</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
