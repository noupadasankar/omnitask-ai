//apps/frontend/src/components/execution/LiveBrowserView.tsx
'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, ShieldAlert, Maximize2, Minimize2, RefreshCw, Camera, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScreenshotFrame, ExecutionState } from '@/types/agent';

interface LiveBrowserViewProps {
  currentScreenshot: ScreenshotFrame | null;
  phase: string;
  /** Authoritative derived execution state — for precise pre-frame labels. */
  executionState?: ExecutionState | null;
  children?: React.ReactNode;
}

interface CursorTrail {
  id: number;
  x: number;
  y: number;
}

export function LiveBrowserView({ currentScreenshot, phase, executionState, children }: LiveBrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [cursorTrails, setCursorTrails] = useState<CursorTrail[]>([]);
  const [recTime, setRecTime] = useState(0);
  const recStartRef = useRef<number | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  const trailIdRef = useRef(0);

  const currentUrl = currentScreenshot?.url || 'chrome://newtab';

  const isExecuting = phase === 'executing';
  const isLive = isExecuting && currentScreenshot;

  // Recording timer
  useEffect(() => {
    if (isExecuting) {
      if (!recStartRef.current) recStartRef.current = Date.now();
      const interval = setInterval(() => {
        if (recStartRef.current) {
          setRecTime(Math.floor((Date.now() - recStartRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else if (phase === 'idle') {
      recStartRef.current = null;
      setRecTime(0);
    }
  }, [isExecuting, phase]);

  // Draw screenshot to canvas with overlays
  useEffect(() => {
    if (!currentScreenshot || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      setImageLoaded(true);
      canvas.width = currentScreenshot.width || 1280;
      canvas.height = currentScreenshot.height || 720;
      ctx.drawImage(img, 0, 0);

      // Render highlighted element
      if (currentScreenshot.highlightedElement) {
        const { x, y, width, height } = currentScreenshot.highlightedElement;
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
        ctx.shadowBlur = 12;
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
        ctx.fillRect(x, y, width, height);

        // Label
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x, y - 18, 60, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('TARGET', x + 6, y - 6);
        ctx.restore();
      }

      // Cursor with glow
      if (currentScreenshot.cursorPosition) {
        const { x, y } = currentScreenshot.cursorPosition;

        // Add cursor trail
        if (lastCursorRef.current && (lastCursorRef.current.x !== x || lastCursorRef.current.y !== y)) {
          const scaleX = canvas.clientWidth / canvas.width;
          const scaleY = canvas.clientHeight / canvas.height;
          setCursorTrails(prev => [
            ...prev.slice(-5),
            { id: ++trailIdRef.current, x: lastCursorRef.current!.x * scaleX, y: lastCursorRef.current!.y * scaleY }
          ]);
        }
        lastCursorRef.current = { x, y };

        ctx.save();
        // Outer glow ring
        ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        // Middle ring
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Outer ping ring
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    };
    img.src = `data:image/jpeg;base64,${currentScreenshot.base64}`;
  }, [currentScreenshot]);

  // Clear old cursor trails
  useEffect(() => {
    if (cursorTrails.length === 0) return;
    const timer = setTimeout(() => {
      setCursorTrails(prev => prev.slice(1));
    }, 800);
    return () => clearTimeout(timer);
  }, [cursorTrails]);

  const formatRecTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Show the live canvas as soon as a frame exists. Only fall back to the
  // placeholder before any frame has arrived (idle / goal parsing / planning /
  // awaiting the launch gate — the browser is intentionally not open yet).
  const showPlaceholder = !currentScreenshot || phase === 'idle' || phase === 'parsing';
  const isAwaitingApproval = phase === 'waiting_approval';
  // The browser runtime is launching Chromium but no frame has streamed yet.
  const isLaunching =
    executionState === 'BROWSER_INITIALIZING' || executionState === 'READY';

  return (
    <div
      className={cn(
        "relative rounded-3xl border border-white/10 bg-zinc-950/40 p-4 backdrop-blur-2xl transition-all shadow-2xl flex flex-col min-h-[420px]",
        fullscreen && "fixed inset-4 z-50 bg-black border-red-500/30 neon-glow-red",
        isExecuting && "scanline-overlay"
      )}
    >
      {/* Chrome Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <div className="flex items-center gap-2">
          {/* Chrome dots */}
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors cursor-pointer" />
            <span className="h-3 w-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors cursor-pointer" />
          </div>

          <span className="text-[10px] font-mono text-zinc-500 ml-4 hidden md:inline">CHROMIUM SANDBOX</span>
        </div>

        {/* URL bar */}
        <div className="flex-1 max-w-md mx-6 flex items-center justify-center gap-2 px-4 py-1.5 rounded-full bg-black/60 border border-white/5 text-[11px] font-mono text-zinc-400">
          <RefreshCw
            className={cn("h-3 w-3 text-zinc-600 flex-shrink-0", isExecuting && "animate-spin")}
            style={{ animationDuration: '3s' }}
          />
          <span className="truncate">{currentUrl}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Recording indicator */}
          {isLive && (
            <div className="rec-indicator">
              <span className="rec-dot" />
              REC {formatRecTime(recTime)}
            </div>
          )}

          {/* Connection status */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-widest",
            isExecuting
              ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
              : "text-zinc-600 bg-zinc-800/30 border border-white/5"
          )}>
            {isExecuting ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
            {isExecuting ? 'CONNECTED' : 'IDLE'}
          </div>

          {/* Fullscreen */}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white transition-all hover:bg-white/[0.05]"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Viewport — FIXED 16:9 box. Placeholder and live canvas both fill this
          exact area absolutely, so the box never resizes between states and the
          chrome header above stays put. */}
      <div className="relative w-full aspect-video overflow-hidden rounded-2xl bg-black/40 border border-white/5 crt-lines">
        {showPlaceholder ? (
          children ? (
            <div className="absolute inset-0 flex items-center justify-center">{children}</div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <div className="absolute inset-0 cyber-grid opacity-5 pointer-events-none" />

              {/* Orbiting idle animation */}
              <div className="orbit-container mb-6">
                <div className="orbit-ring">
                  <div className="orbit-dot" />
                </div>
                <div className="orbit-ring">
                  <div className="orbit-dot" />
                </div>
                <div className="orbit-ring">
                  <div className="orbit-dot" />
                </div>
                <div className="absolute inset-[35px] flex items-center justify-center">
                  <Monitor className="h-10 w-10 text-zinc-600" />
                </div>
              </div>

              <h4 className={cn(
                "text-sm font-bold font-mono tracking-wider",
                isAwaitingApproval ? "text-amber-400" : isLaunching ? "text-emerald-400" : "text-zinc-400"
              )}>
                {/* execution:state (authoritative) takes precedence over phase. */}
                {isLaunching ? '🚀 LAUNCHING BROWSER...' : (
                  <>
                    {phase === 'parsing' && 'PARSING GOAL INTENT...'}
                    {phase === 'planning' && 'COMPILING EXECUTION PLAN...'}
                    {phase === 'idle' && 'VIEWPORT AWAITING DEPLOYMENT'}
                    {isAwaitingApproval && '🔒 AWAITING LAUNCH AUTHORIZATION'}
                    {(!phase || phase === 'executing') && 'ESTABLISHING STREAM...'}
                  </>
                )}
              </h4>
              <p className="text-xs text-zinc-600 mt-2 max-w-xs leading-relaxed">
                {isLaunching
                  ? 'Gate cleared. The browser runtime is starting Chromium — the live stream begins on the first frame.'
                  : isAwaitingApproval
                    ? 'Plan ready. The browser stays closed until you approve the launch request below.'
                    : 'Deploy tasks to launch the secure browser viewport and stream execution live.'}
              </p>
            </div>
          )
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full object-contain transition-opacity"
              style={{ display: imageLoaded ? 'block' : 'none' }}
            />

            {/* First-frame loader — keeps the box stable until the canvas paints */}
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-zinc-600 animate-spin" />
              </div>
            )}

            {/* Cursor trails */}
            {cursorTrails.map(trail => (
              <div
                key={trail.id}
                className="cursor-trail-dot"
                style={{ left: trail.x - 6, top: trail.y - 6 }}
              />
            ))}

            {/* Resolution badge */}
            {currentScreenshot && (
              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 border border-white/10 text-[8px] font-mono text-zinc-500">
                {currentScreenshot.width}×{currentScreenshot.height}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
