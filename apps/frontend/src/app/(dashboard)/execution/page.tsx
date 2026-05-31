'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, ShieldCheck, Play, Pause, Square, History, Calendar, Brain } from 'lucide-react';
import Link from 'next/link';

// Component layout assemblies
import { GoalInput } from '@/components/execution/GoalInput';
import { LiveBrowserView } from '@/components/execution/LiveBrowserView';
import { PlanPanel } from '@/components/execution/PlanPanel';
import { ActionTimeline } from '@/components/execution/ActionTimeline';
import { ApprovalPanel } from '@/components/execution/ApprovalPanel';
import { AgentCards } from '@/components/execution/AgentCards';
import { LogPanel } from '@/components/execution/LogPanel';
import { NLCommandInput } from '@/components/execution/NLCommandInput';

// Hooks and stores
import { useAgentSession } from '@/hooks/useAgentSession';
import { useAgentStore } from '@/store/agent.store';

export default function MissionControlPage() {
  const session = useAgentSession();
  const store = useAgentStore();
  const [loading, setLoading] = useState(false);

  const handleStart = async (payload: {
    goal: string;
    mode: 'autonomous' | 'approval_required' | 'simulation';
    maxBudget?: number;
    allowPayments?: boolean;
    allowLogin?: boolean;
  }) => {
    setLoading(true);
    try {
      await session.startSession(payload);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isRunning = session.phase === 'executing' || session.phase === 'waiting_approval' || session.phase === 'waiting_otp';
  const showHUD = session.phase !== 'idle' && session.sessionId;

  return (
    <div className="relative flex flex-col gap-6 p-6 min-h-screen text-white bg-black">
      {/* Dynamic scanlines & cyber grid visual borders */}
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-red-500/5 to-transparent blur-[120px] pointer-events-none" />

      {/* Header Banner */}
      <header className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-wider text-white">MISSION CONTROL CENTER</h1>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest mt-0.5">AUTONOMOUS RUNTIME OPERATIONS</p>
          </div>
        </div>

        {/* Dynamic header options */}
        <div className="flex items-center gap-2">
          <Link href="/execution/history">
            <button className="h-9 px-4 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-bold font-mono text-zinc-400 hover:text-white transition-all hover:bg-white/[0.04] flex items-center gap-2">
              <History className="h-4 w-4" />
              HISTORY CATALOG
            </button>
          </Link>
          <Link href="/execution/schedules">
            <button className="h-9 px-4 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-bold font-mono text-zinc-400 hover:text-white transition-all hover:bg-white/[0.04] flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              SCHEDULE MANAGER
            </button>
          </Link>
        </div>
      </header>

      {/* Goal Input Section */}
      <section className="relative z-10">
        <GoalInput onStart={handleStart} loading={loading} />
      </section>

      {/* Main Glassmorphic Operations HUD Console Grid */}
      <AnimatePresence mode="wait">
        {showHUD ? (
          <motion.div
            key="hud-console"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="relative z-10 flex flex-col gap-6"
          >
            {/* Control Bar Actions */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">RUNNING TELEMETRY ID:</span>
                <span className="text-xs font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded uppercase tracking-wider">{session.sessionId}</span>
                <span className="text-zinc-600">|</span>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">STATE:</span>
                <span className="text-xs font-mono font-bold text-white uppercase">{session.phase}</span>
              </div>

              {/* Real-time actions */}
              <div className="flex items-center gap-2">
                {session.phase === 'paused' ? (
                  <button
                    onClick={session.resume}
                    className="h-8 px-4 rounded-xl bg-red-500 text-xs font-bold text-white transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    RESUME RUN
                  </button>
                ) : (
                  <button
                    onClick={session.pause}
                    disabled={!isRunning}
                    className="h-8 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-bold text-zinc-400 hover:text-white transition-all hover:bg-white/[0.04] disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    PAUSE WORK
                  </button>
                )}

                <button
                  onClick={session.cancel}
                  disabled={!isRunning}
                  className="h-8 px-4 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-bold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Square className="h-3.5 w-3.5" />
                  TERMINATE WORKFLOW
                </button>
              </div>
            </div>

            {/* Middle Grid Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Plan list roadmap */}
              <div className="flex flex-col gap-6">
                <PlanPanel plan={session.plan} currentStepIndex={session.currentStepIndex} phase={session.phase} />
                <AgentCards activeAgents={session.activeAgents} />
              </div>

              {/* Right Column: Visual streaming browser */}
              <div>
                <LiveBrowserView currentScreenshot={session.currentScreenshot} phase={session.phase} />
              </div>
            </div>

            {/* Bottom Grid Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Chronological event timeline */}
              <div>
                <ActionTimeline timeline={session.timeline} />
              </div>

              {/* Right: Terminal telemetry logger scroller */}
              <div>
                <LogPanel logs={session.logs} onClear={store.clearLogs} />
              </div>
            </div>

            {/* Active Approval Panel Interception Overlay */}
            {session.pendingApproval && (
              <section className="border border-red-500/25 rounded-3xl bg-red-950/5">
                <ApprovalPanel
                  pendingApproval={session.pendingApproval}
                  onApprove={session.approve}
                  onDeny={session.deny}
                />
              </section>
            )}

            {/* Intervention Command Prompt */}
            {isRunning && (
              <section>
                <NLCommandInput onSendCommand={session.sendInterrupt} disabled={!isRunning} />
              </section>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="idle-placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center text-center p-12 relative border border-white/5 rounded-3xl bg-zinc-950/20 backdrop-blur-xl py-24"
          >
            <div className="absolute inset-0 cyber-grid opacity-5 pointer-events-none" />
            
            <div className="relative mb-6">
              <motion.div
                animate={{
                  boxShadow: [
                    '0 0 0px rgba(239, 68, 68, 0.4)',
                    '0 0 30px rgba(239, 68, 68, 0.6)',
                    '0 0 0px rgba(239, 68, 68, 0.4)',
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity }}
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 mx-auto"
              >
                <Cpu className="h-8 w-8 text-red-400" />
              </motion.div>
            </div>

            <h2 className="text-lg font-bold text-white font-mono tracking-wider">AWAITING SYSTEM INSTRUCTION</h2>
            <p className="text-xs text-zinc-500 mt-2 max-w-sm leading-relaxed">
              Describe your objective in the dashboard console above. The Planner agent will map, coordinate, and execute your workflow inside a sandboxed Chromium session.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
