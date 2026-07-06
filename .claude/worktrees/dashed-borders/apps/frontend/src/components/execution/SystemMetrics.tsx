'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Clock, Layers, Shield, Database,
  Wifi, WifiOff, Zap, TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SystemMetricsProps {
  phase: string;
  currentStepIndex: number;
  totalSteps: number;
  sessionId: string | null;
  currentScreenshot: { sessionId: string; width: number; height: number; timestamp: number } | null;
  screenshotHistoryCount: number;
  plan: { goal: string; riskAssessment?: { overallRisk: string; reasons: string[] } } | null;
  pendingApproval: any | null;
}

function ProgressRing({ progress, size = 48, strokeWidth = 4 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#ef4444"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.6s ease',
            filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-mono font-black text-white">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

export function SystemMetrics({
  phase,
  currentStepIndex,
  totalSteps,
  sessionId,
  currentScreenshot,
  screenshotHistoryCount,
  plan,
  pendingApproval,
}: SystemMetricsProps) {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed timer
  useEffect(() => {
    if (phase !== 'idle' && phase !== 'completed' && phase !== 'failed' && phase !== 'cancelled') {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else if (phase === 'idle') {
      startTimeRef.current = null;
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase]);

  // Reset on new session
  useEffect(() => {
    startTimeRef.current = null;
    setElapsed(0);
  }, [sessionId]);

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = totalSteps > 0 ? (currentStepIndex / totalSteps) * 100 : 0;

  const riskLevel = plan?.riskAssessment?.overallRisk || 'LOW';
  const safetyConfigMap = {
    LOW: { label: 'SAFE', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: '' },
    MEDIUM: { label: 'CAUTION', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', glow: '' },
    HIGH: { label: 'DANGER', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', glow: 'neon-glow-red' },
    CRITICAL: { label: 'CRITICAL', color: 'text-red-500', bg: 'bg-red-500/15', border: 'border-red-500/30', glow: 'neon-glow-red-intense' },
  };
  const safetyConfig =
    safetyConfigMap[riskLevel as keyof typeof safetyConfigMap] || safetyConfigMap.LOW;

  const phaseConfig: Record<string, { label: string; color: string; bg: string; border: string; pulse: boolean }> = {
    idle: { label: 'STANDBY', color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', pulse: false },
    parsing: { label: 'PARSING', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', pulse: true },
    planning: { label: 'PLANNING', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', pulse: true },
    executing: { label: 'EXECUTING', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', pulse: true },
    paused: { label: 'PAUSED', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', pulse: false },
    waiting_approval: { label: 'AWAITING APPROVAL', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', pulse: true },
    waiting_otp: { label: 'AWAITING OTP', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', pulse: true },
    completed: { label: 'COMPLETED', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', pulse: false },
    failed: { label: 'FAILED', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', pulse: false },
    cancelled: { label: 'CANCELLED', color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', pulse: false },
  };

  const phaseCfg = phaseConfig[phase] || phaseConfig.idle;
  const bufferPercent = Math.min(100, (screenshotHistoryCount / 50) * 100);
  const isActive = phase === 'executing';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="metrics-strip relative"
    >
      {/* Scan-line effect */}
      {isActive && <div className="absolute inset-0 rounded-[20px] scanline-overlay pointer-events-none" />}

      {/* Progress Ring */}
      <div className="metric-card">
        <ProgressRing progress={progress} />
        <div>
          <div className="metric-label">PROGRESS</div>
          <div className="metric-value">{currentStepIndex}/{totalSteps}</div>
        </div>
      </div>

      {/* Elapsed Time */}
      <div className="metric-card">
        <Clock className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-red-400" : "text-zinc-500")} />
        <div>
          <div className="metric-label">ELAPSED</div>
          <div className={cn("metric-value tabular-nums", isActive && "neon-text-red")}>{formatElapsed(elapsed)}</div>
        </div>
      </div>

      {/* Phase Badge */}
      <div className="metric-card">
        <div className={cn("flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-widest", phaseCfg.bg, phaseCfg.border, phaseCfg.color, phaseCfg.pulse && "animate-pulse")}>
          {phaseCfg.pulse && <span className={cn("h-1.5 w-1.5 rounded-full", phase === 'executing' ? 'bg-red-500' : 'bg-current')} />}
          {phaseCfg.label}
        </div>
      </div>

      {/* Safety Score */}
      <div className={cn("metric-card", safetyConfig.glow)}>
        <Shield className={cn("h-5 w-5 flex-shrink-0", safetyConfig.color)} />
        <div>
          <div className="metric-label">SAFETY</div>
          <div className={cn("text-xs font-mono font-bold uppercase", safetyConfig.color)}>{safetyConfig.label}</div>
        </div>
      </div>

      {/* Memory Buffer */}
      <div className="metric-card">
        <Database className="h-5 w-5 text-zinc-500 flex-shrink-0" />
        <div className="min-w-[80px]">
          <div className="metric-label">FRAME BUFFER</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${bufferPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-[9px] font-mono text-zinc-500">{screenshotHistoryCount}/50</span>
          </div>
        </div>
      </div>

      {/* Network Pulse */}
      <div className="metric-card">
        {isActive ? (
          <Wifi className="h-5 w-5 text-emerald-400 flex-shrink-0" />
        ) : (
          <WifiOff className="h-5 w-5 text-zinc-600 flex-shrink-0" />
        )}
        <div>
          <div className="metric-label">STREAM</div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "h-2 w-2 rounded-full flex-shrink-0",
              isActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-700"
            )} />
            <span className={cn("text-[10px] font-mono font-bold uppercase", isActive ? "text-emerald-400" : "text-zinc-600")}>
              {isActive ? 'LIVE' : 'STANDBY'}
            </span>
          </div>
        </div>
      </div>

      {/* Viewport Resolution */}
      {currentScreenshot && (
        <div className="metric-card">
          <TrendingUp className="h-5 w-5 text-zinc-500 flex-shrink-0" />
          <div>
            <div className="metric-label">VIEWPORT</div>
            <div className="text-[11px] font-mono font-bold text-zinc-300">
              {currentScreenshot.width}×{currentScreenshot.height}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
