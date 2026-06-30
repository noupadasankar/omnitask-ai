'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, ArrowLeft, Calendar, Monitor, Cpu } from 'lucide-react';
import Link from 'next/link';
import { getSessionReplay, getAgentSession, getSessionThoughts, ReplayThought } from '@/services/agent.service';
import { cn } from '@/lib/utils';

export default function ReplayPage({ params }: { params: { sessionId: string } }) {
  const [replayFrames, setReplayFrames] = useState<any[]>([]);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [thoughts, setThoughts] = useState<ReplayThought[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1500); // 1.5s per frame
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [repData, sessData] = await Promise.all([
          getSessionReplay(params.sessionId),
          getAgentSession(params.sessionId),
        ]);
        setReplayFrames(repData.replay || []);
        setSessionInfo(sessData);
        // The AI monologue is best-effort: cognitive runs have it, others don't.
        try {
          const t = await getSessionThoughts(params.sessionId);
          setThoughts(t.thoughts || []);
        } catch {
          setThoughts([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.sessionId]);

  // Handle auto playback loop
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentFrameIndex((prev) => {
          if (prev >= replayFrames.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playSpeed);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
    }

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, replayFrames.length, playSpeed]);

  const activeFrame = replayFrames[currentFrameIndex];
  // Align the AI monologue to the SCREENSHOT by stepIndex, not array position.
  // Frames (execution steps that produced a screenshot) and thoughts (trajectory
  // reasoning rows) drift apart whenever a step reasons but produces no frame —
  // e.g. a firewall-blocked, gated, vision, or extract step. Positional alignment
  // then shows the WRONG thought for a frame. Match by stepIndex, falling back to
  // the most recent reasoning at-or-before this frame's step.
  const { activeThought, thoughtIsApprox } = useMemo<{
    activeThought: ReplayThought | null;
    thoughtIsApprox: boolean;
  }>(() => {
    if (!thoughts.length) return { activeThought: null, thoughtIsApprox: false };
    const frameStep = activeFrame?.stepIndex;
    if (typeof frameStep !== 'number') {
      // Frame carries no stepIndex — degrade to the old positional alignment.
      return {
        activeThought: thoughts[Math.min(currentFrameIndex, thoughts.length - 1)],
        thoughtIsApprox: true,
      };
    }
    const exact = thoughts.find((t) => t.stepIndex === frameStep);
    if (exact) return { activeThought: exact, thoughtIsApprox: false };
    // Nearest reasoning at or before this frame's step (the decision that led here).
    const preceding = thoughts
      .filter((t) => t.stepIndex <= frameStep)
      .sort((a, b) => b.stepIndex - a.stepIndex)[0];
    return { activeThought: preceding ?? null, thoughtIsApprox: true };
  }, [thoughts, activeFrame, currentFrameIndex]);

  // A frame whose stored outcome wasn't a clean success (failed / blocked /
  // skipped) — surfaced so the scrubber flags where the run deviated.
  const frameBlocked =
    !!activeFrame && /fail|block|error|deny|denied|skip/i.test(String(activeFrame.status || ''));
  const dateFormatted = sessionInfo ? new Date(sessionInfo.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className="relative flex flex-col gap-6 p-6 min-h-screen text-white bg-black">
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center">
            <Monitor className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-wider text-white">Visual Scrubber Playback</h1>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest mt-0.5">STEP-BY-STEP SIMULATION GRAPH</p>
          </div>
        </div>

        <Link href="/execution/history">
          <button className="h-9 px-4 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-bold font-mono text-zinc-400 hover:text-white transition-all hover:bg-white/[0.04] flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            HISTORY LEDGER
          </button>
        </Link>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-24">
          <Cpu className="h-8 w-8 text-red-500 animate-spin mb-3" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">COMPILING REPLAY CHRONOLOGY...</span>
        </div>
      ) : replayFrames.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center border border-white/5 rounded-3xl bg-zinc-950/20 py-24">
          <Monitor className="h-10 w-10 text-zinc-700 mb-3" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">No screenshots captured for playback</span>
          <p className="text-[10px] text-zinc-600 mt-2">Make sure goals are launched in simulation or autonomous modes to register logs.</p>
        </div>
      ) : (
        <section className="relative z-10 grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 items-start">
          {/* Left Column: Visual Viewport screen frame */}
          <div className="xl:col-span-2 rounded-3xl border border-white/5 bg-zinc-950/40 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">SCREEN BUFFER FRAME {currentFrameIndex + 1} OF {replayFrames.length}</span>
              {frameBlocked ? (
                <span
                  className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded uppercase font-bold tracking-widest"
                  title={`Step status: ${activeFrame?.status}`}
                >
                  ⚠ {String(activeFrame?.status || 'deviation')}
                </span>
              ) : (
                <span className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded uppercase font-bold tracking-widest">PLAYBACK ACTIVE</span>
              )}
            </div>

            {/* Simulated browser window */}
            <div className="relative rounded-2xl border border-white/5 bg-black overflow-hidden flex items-center justify-center min-h-[360px] max-h-[480px]">
              <img
                src={activeFrame?.screenshotUrl?.startsWith('data:') ? activeFrame.screenshotUrl : `data:image/jpeg;base64,${activeFrame?.screenshotUrl || ''}`}
                alt="Replay Capture View"
                className="max-w-full max-h-[460px] object-contain transition-all duration-300"
              />
            </div>

            {/* Playback Controls Scrubber */}
            <div className="space-y-4 pt-3 border-t border-white/5">
              {/* Range scrub slider */}
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono text-zinc-500">{currentFrameIndex + 1}</span>
                <input
                  type="range"
                  min="0"
                  max={replayFrames.length - 1}
                  value={currentFrameIndex}
                  onChange={(e) => setCurrentFrameIndex(Number(e.target.value))}
                  className="w-full accent-red-500 bg-zinc-800 rounded-lg appearance-none h-2 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-zinc-500">{replayFrames.length}</span>
              </div>

              {/* Scrubber buttons bar */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentFrameIndex(0)}
                    disabled={currentFrameIndex === 0}
                    className="h-8 w-8 flex items-center justify-center rounded bg-white/[0.02] border border-white/5 text-zinc-400 hover:text-white transition-all disabled:opacity-30"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="h-9 px-4 rounded-xl bg-red-500 text-xs font-bold text-white transition-all hover:scale-105 hover:shadow-[0_0_10px_rgba(239,68,68,0.4)] flex items-center gap-1.5"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isPlaying ? 'PAUSE' : 'PLAY'}
                  </button>

                  <button
                    onClick={() => setCurrentFrameIndex((prev) => Math.min(replayFrames.length - 1, prev + 1))}
                    disabled={currentFrameIndex === replayFrames.length - 1}
                    className="h-8 w-8 flex items-center justify-center rounded bg-white/[0.02] border border-white/5 text-zinc-400 hover:text-white transition-all disabled:opacity-30"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>

                {/* Speed selector */}
                <div className="flex items-center gap-1 bg-black/40 border border-white/5 p-1 rounded-xl">
                  {([500, 1000, 1500, 3000] as const).map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaySpeed(spd)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all",
                        playSpeed === spd
                          ? "bg-red-500/10 border border-red-500/20 text-red-400"
                          : "border-transparent text-zinc-500 hover:text-white"
                      )}
                    >
                      {spd === 500 ? 'Fast' : spd === 3000 ? 'Slow' : `${spd / 1000}s`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Execution Information steps ledger */}
          <div className="rounded-3xl border border-white/5 bg-zinc-950/40 p-5 flex flex-col gap-4 max-h-[620px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Session objective ledger</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateFormatted}
                </span>
                <h3 className="text-sm font-bold text-white leading-snug">
                  {(sessionInfo?.metadata as any)?.goal || sessionInfo?.naturalLanguage || 'Autonomous Run'}
                </h3>
              </div>

              {/* AI Monologue — the cognitive reasoning for the active frame */}
              {activeThought && (
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.03] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest">
                      🧠 AI Monologue
                      {typeof activeThought.stepIndex === 'number' && (
                        <span className="ml-1.5 normal-case text-indigo-400/70">· step {activeThought.stepIndex + 1}</span>
                      )}
                      {thoughtIsApprox && (
                        <span
                          className="ml-1.5 normal-case text-amber-400/80"
                          title="No reasoning row was recorded for this exact frame; showing the most recent reasoning before it."
                        >
                          ≈ nearest
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {activeThought.tool && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/5 text-zinc-300">
                          {activeThought.tool}
                        </span>
                      )}
                      {typeof activeThought.confidence === 'number' && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                          conf {activeThought.confidence.toFixed(2)}
                        </span>
                      )}
                      {typeof activeThought.risk === 'number' && (
                        <span className={cn(
                          "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                          activeThought.risk >= 0.6
                            ? "bg-red-500/10 border-red-500/20 text-red-300"
                            : "bg-white/[0.04] border-white/5 text-zinc-400",
                        )}>
                          risk {activeThought.risk.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed">
                    {activeThought.thought || <span className="text-zinc-500 italic">No reasoning captured for this step.</span>}
                  </p>
                  <button
                    onClick={() => setShowRaw((v) => !v)}
                    className="text-[9px] font-mono text-indigo-400 hover:text-indigo-300 uppercase tracking-wider"
                  >
                    {showRaw ? '▼ Hide raw decision' : '▶ Show raw decision'}
                  </button>
                  {showRaw && (
                    <pre className="text-[10px] bg-black/60 text-indigo-200 p-2.5 rounded-lg overflow-x-auto max-h-[180px] border border-white/5">
                      {JSON.stringify(activeThought.decision ?? {}, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* Steps listing */}
              <div className="overflow-y-auto max-h-[460px] space-y-2 pr-1">
                {replayFrames.map((frame, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentFrameIndex(idx);
                      setIsPlaying(false);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-2xl border transition-all flex items-start gap-3",
                      currentFrameIndex === idx
                        ? "border-red-500/20 bg-red-500/[0.02]"
                        : "border-transparent hover:border-white/5"
                    )}
                  >
                    <span className={cn(
                      "h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono border",
                      currentFrameIndex === idx ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/5 text-zinc-500"
                    )}>
                      {idx + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                        {frame.action}
                        {/fail|block|error|deny|denied|skip/i.test(String(frame.status || '')) && (
                          <span className="text-amber-400" title={`Step status: ${frame.status}`}>⚠</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-zinc-300 truncate mt-0.5">{frame.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
