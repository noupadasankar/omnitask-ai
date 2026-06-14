//apps/frontend/src/components/execution/LiveBrowserView.tsx
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Monitor, ShieldAlert, Maximize2, Minimize2, RefreshCw,
  Wifi, WifiOff, ChevronLeft, ChevronRight, RotateCw,
  Lock, Paperclip, Loader2, Hand,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { wsService } from '@/services/websocket.service';
import { saveJobProfile } from '@/lib/job-profile';
import type { ScreenshotFrame, ExecutionState } from '@/types/agent';

interface LiveBrowserViewProps {
  currentScreenshot: ScreenshotFrame | null;
  phase: string;
  executionState?: ExecutionState | null;
  errorMessage?: string | null;
  sessionId?: string | null;
  children?: React.ReactNode;
}

interface ClickRipple { id: number; x: number; y: number }

export function LiveBrowserView({
  currentScreenshot,
  phase,
  executionState,
  errorMessage,
  sessionId,
  children,
}: LiveBrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // RAF rendering refs — no state for frames, avoids re-renders
  const latestFrameRef = useRef<ScreenshotFrame | null>(null);
  const lastRenderedRef = useRef<ScreenshotFrame | null>(null);
  const rafRef = useRef<number>(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // FPS tracking
  const frameTsRef = useRef<number[]>([]);
  const [fps, setFps] = useState(0);

  const [fullscreen, setFullscreen] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [fileChooserOpen, setFileChooserOpen] = useState(false);
  const [recovery, setRecovery] = useState<'recovering' | 'recovered' | 'failed' | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [cursorDown, setCursorDown] = useState(false);
  const [clickRipples, setClickRipples] = useState<ClickRipple[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlFocused, setUrlFocused] = useState(false);

  const recStartRef = useRef<number | null>(null);
  const lastMoveSentRef = useRef(0);
  const rippleIdRef = useRef(0);

  const currentUrl = currentScreenshot?.url ?? 'chrome://newtab';

  const isExecuting = phase === 'executing';
  const isLive = isExecuting && !!currentScreenshot;
  // Always in control when a live frame exists — no toggle needed
  const isControlling = !!sessionId && !!currentScreenshot;

  const isFailed = phase === 'failed';
  const isLaunching =
    executionState === 'BROWSER_INITIALIZING' || executionState === 'READY';
  const isSessionStarting = !!sessionId && !currentScreenshot && !isFailed;
  const showPlaceholder = !currentScreenshot || phase === 'idle' || phase === 'parsing' || isFailed;
  const isAwaitingApproval = phase === 'waiting_approval';

  // ── File chooser ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    const off = wsService.on('browser:filechooser', (data: any) => {
      if (data?.sessionId !== sessionId) return;
      setFileChooserOpen(true);
      fileInputRef.current?.click();
    });
    return off;
  }, [sessionId]);

  // ── Crash recovery banner ────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    const offRecovering = wsService.on('browser:recovering', (d: any) => {
      if (d?.sessionId === sessionId) setRecovery('recovering');
    });
    const offRecovered = wsService.on('browser:recovered', (d: any) => {
      if (d?.sessionId === sessionId) setRecovery('recovered');
    });
    const offFailed = wsService.on('browser:recovery_failed', (d: any) => {
      if (d?.sessionId === sessionId) setRecovery('failed');
    });
    return () => { offRecovering(); offRecovered(); offFailed(); };
  }, [sessionId]);

  // Auto-dismiss the "recovered" banner shortly after the stream resumes.
  useEffect(() => {
    if (recovery !== 'recovered') return;
    const t = setTimeout(() => setRecovery(null), 2500);
    return () => clearTimeout(t);
  }, [recovery]);

  // Clear any stale recovery banner when the run resets to idle.
  useEffect(() => {
    if (phase === 'idle') setRecovery(null);
  }, [phase]);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setFileChooserOpen(false);
      const file = e.target.files?.[0];
      if (!file || !sessionId) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] ?? '';
        wsService.sendBrowserInput(sessionId, { type: 'file_upload', filename: file.name, mimeType: file.type, base64 });
        // Persist resume metadata locally so the Job Profile tab reflects the upload
        saveJobProfile({ resumeUploaded: true, resumeName: file.name });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [sessionId],
  );

  // ── Coordinate mapping ───────────────────────────────────────────────────────

  const toFrameCoords = useCallback(
    (e: React.PointerEvent | React.WheelEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const fw = canvas.width;
      const fh = canvas.height;
      if (!fw || !fh) return null;
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / fw, rect.height / fh);
      const renderW = fw * scale;
      const renderH = fh * scale;
      const offsetX = (rect.width - renderW) / 2;
      const offsetY = (rect.height - renderH) / 2;
      const px = e.clientX - rect.left - offsetX;
      const py = e.clientY - rect.top - offsetY;
      if (px < 0 || py < 0 || px > renderW || py > renderH) return null;
      return { x: Math.round((px / renderW) * fw), y: Math.round((py / renderH) * fh) };
    },
    [],
  );

  const toLocalPos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // ── Input handlers ───────────────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isControlling || !sessionId) return;
      const c = toFrameCoords(e);
      if (!c) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      (e.currentTarget as HTMLElement).focus();
      setCursorDown(true);
      const local = toLocalPos(e);
      if (local) setClickRipples((prev) => [...prev.slice(-4), { id: ++rippleIdRef.current, ...local }]);
      if (e.button === 2) {
        wsService.sendBrowserInput(sessionId, { type: 'rightclick', ...c });
      } else if (e.detail >= 2) {
        wsService.sendBrowserInput(sessionId, { type: 'dblclick', ...c });
      } else {
        wsService.sendBrowserInput(sessionId, { type: 'mousedown', ...c });
      }
    },
    [isControlling, sessionId, toFrameCoords, toLocalPos],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isControlling || !sessionId) return;
      const c = toFrameCoords(e);
      setCursorDown(false);
      if (!c) return;
      e.preventDefault();
      wsService.sendBrowserInput(sessionId, { type: 'mouseup', ...c });
    },
    [isControlling, sessionId, toFrameCoords],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isControlling || !sessionId) return;
      setCursorPos(toLocalPos(e));
      const now = Date.now();
      if (now - lastMoveSentRef.current < 25) return;
      const c = toFrameCoords(e);
      if (!c) return;
      lastMoveSentRef.current = now;
      wsService.sendBrowserInput(sessionId, { type: 'mousemove', ...c });
    },
    [isControlling, sessionId, toFrameCoords, toLocalPos],
  );

  const onPointerLeave = useCallback(() => {
    setCursorPos(null);
    setCursorDown(false);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isControlling || !sessionId) return;
      wsService.sendBrowserInput(sessionId, { type: 'wheel', deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) });
    },
    [isControlling, sessionId],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isControlling || !sessionId) return;

      // Ctrl/Cmd+V → paste clipboard text into Python browser
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        navigator.clipboard.readText()
          .then((text) => { if (text) wsService.sendBrowserInput(sessionId, { type: 'type', text }); })
          .catch(() => {});
        return;
      }

      // Ctrl/Cmd+L → focus local address bar (Chrome behaviour)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
        return;
      }

      e.preventDefault();
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        wsService.sendBrowserInput(sessionId, { type: 'type', text: e.key });
      } else {
        wsService.sendBrowserInput(sessionId, { type: 'key', key: e.key });
      }
    },
    [isControlling, sessionId],
  );

  // ── Navigation ───────────────────────────────────────────────────────────────

  const navTo = useCallback(
    (raw: string) => {
      if (!isControlling || !sessionId) return;
      let url = raw.trim();
      if (!url) return;
      if (!/^[a-z]+:\/\//i.test(url)) {
        url = /^[^\s]+\.[^\s]+$/.test(url)
          ? `https://${url}`
          : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
      wsService.sendBrowserInput(sessionId, { type: 'navigate', url });
    },
    [isControlling, sessionId],
  );

  const navAction = useCallback(
    (type: 'back' | 'forward' | 'reload') => {
      if (!isControlling || !sessionId) return;
      wsService.sendBrowserInput(sessionId, { type });
    },
    [isControlling, sessionId],
  );

  useEffect(() => {
    if (!urlFocused) setUrlDraft(currentUrl);
  }, [currentUrl, urlFocused]);

  // ── Auto-focus canvas on first frame ─────────────────────────────────────────

  useEffect(() => {
    if (currentScreenshot && canvasRef.current) {
      canvasRef.current.focus({ preventScroll: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!currentScreenshot]);

  // ── Store latest frame in ref (no re-render) ─────────────────────────────────

  useEffect(() => {
    if (!currentScreenshot) return;
    latestFrameRef.current = currentScreenshot;
    // Track FPS
    const now = Date.now();
    frameTsRef.current = [...frameTsRef.current.slice(-19), now];
  }, [currentScreenshot]);

  // ── RAF rendering loop ───────────────────────────────────────────────────────

  useEffect(() => {
    let running = true;

    const draw = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(draw);

      const frame = latestFrameRef.current;
      if (!frame || frame === lastRenderedRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Reuse a single Image object — reset src to new frame
      if (!imgRef.current) imgRef.current = new Image();
      const img = imgRef.current;
      const targetFrame = frame;

      img.onload = () => {
        if (lastRenderedRef.current === targetFrame) return; // already rendered newer frame
        canvas.width = targetFrame.width || 1280;
        canvas.height = targetFrame.height || 800;
        ctx.drawImage(img, 0, 0);

        // Highlighted element overlay
        if (targetFrame.highlightedElement) {
          const { x, y, width, height } = targetFrame.highlightedElement;
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.shadowColor = 'rgba(239,68,68,0.6)';
          ctx.shadowBlur = 12;
          ctx.strokeRect(x, y, width, height);
          ctx.fillStyle = 'rgba(239,68,68,0.08)';
          ctx.fillRect(x, y, width, height);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x, y - 18, 60, 16);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('TARGET', x + 6, y - 6);
          ctx.restore();
        }

        // Agent cursor overlay
        if (targetFrame.cursorPosition) {
          const { x, y } = targetFrame.cursorPosition;
          ctx.save();
          ctx.shadowColor = 'rgba(239,68,68,0.5)';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239,68,68,0.35)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }

        lastRenderedRef.current = targetFrame;
      };
      img.src = `data:image/jpeg;base64,${frame.base64}`;
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── FPS compute (1 Hz) ───────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      const ts = frameTsRef.current;
      if (ts.length < 2) { setFps(0); return; }
      const elapsed = (ts[ts.length - 1] - ts[0]) / 1000;
      setFps(elapsed > 0 ? Math.round((ts.length - 1) / elapsed) : 0);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Recording timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isExecuting) {
      if (!recStartRef.current) recStartRef.current = Date.now();
      const interval = setInterval(() => {
        if (recStartRef.current) setRecTime(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else if (phase === 'idle') {
      recStartRef.current = null;
      setRecTime(0);
    }
  }, [isExecuting, phase]);

  // ── Fullscreen ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);

  // ── Click ripple cleanup ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!clickRipples.length) return;
    const t = setTimeout(() => setClickRipples((p) => p.slice(1)), 600);
    return () => clearTimeout(t);
  }, [clickRipples]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const formatRecTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const truncateUrl = (u: string, max = 55) => u.length > max ? u.slice(0, max) + '…' : u;

  // ── Content ──────────────────────────────────────────────────────────────────

  const content = (
    <div className={cn(
      'relative flex flex-col rounded-3xl border border-white/10 bg-zinc-950/40 p-4 backdrop-blur-2xl shadow-2xl transition-all min-h-[420px]',
      fullscreen && 'flex-1 m-0 bg-black border-red-500/30',
      isExecuting && 'scanline-overlay',
    )}>
      {/* ── Chrome header ─────────────────────────────────────────────────────── */}
      <div className="mb-3 space-y-2 border-b border-white/10 pb-2">
        {/* Row 1 — traffic lights + tab + controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Traffic lights */}
            <div className="flex flex-shrink-0 gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500/80 transition-colors hover:bg-red-500 cursor-pointer" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80 transition-colors hover:bg-yellow-500 cursor-pointer" />
              <span className="h-3 w-3 rounded-full bg-green-500/80 transition-colors hover:bg-green-500 cursor-pointer" />
            </div>
            {/* Active tab */}
            <div className="flex min-w-0 max-w-[280px] items-center gap-2 rounded-t-lg border border-b-0 border-white/10 bg-white/[0.04] px-3 py-1">
              <Monitor className="h-3 w-3 flex-shrink-0 text-zinc-500" />
              <span className="truncate text-[11px] text-zinc-300">
                {currentScreenshot?.title || 'Chromium Sandbox'}
              </span>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {isLive && (
              <div className="rec-indicator">
                <span className="rec-dot" />
                REC {formatRecTime(recTime)}
              </div>
            )}
            <div className={cn(
              'flex items-center gap-1 rounded border px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-widest',
              isExecuting
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border-white/5 bg-zinc-800/30 text-zinc-600',
            )}>
              {isExecuting ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
              {isExecuting ? 'CONNECTED' : 'IDLE'}
            </div>

            {/* File upload button (live only) */}
            {isControlling && (
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Upload a file to the browser"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg border transition-all',
                  fileChooserOpen
                    ? 'animate-pulse border-amber-500/40 bg-amber-500/15 text-amber-300'
                    : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:text-white',
                )}
              >
                <Paperclip className="h-4 w-4" />
              </button>
            )}

            <button
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white"
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Row 2 — back / forward / reload + address bar */}
        <div className="flex items-center gap-2">
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {([
              { icon: ChevronLeft, action: 'back' as const, label: 'Back' },
              { icon: ChevronRight, action: 'forward' as const, label: 'Forward' },
              { icon: RotateCw, action: 'reload' as const, label: 'Reload' },
            ] as const).map(({ icon: Icon, action, label }) => (
              <button
                key={action}
                onClick={() => navAction(action)}
                disabled={!isControlling}
                title={isControlling ? label : 'No active session'}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg transition-all',
                  isControlling
                    ? 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                    : 'cursor-not-allowed text-zinc-700',
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          {/* Address bar */}
          <form
            onSubmit={(e) => { e.preventDefault(); navTo(urlDraft); (document.activeElement as HTMLElement)?.blur(); }}
            className={cn(
              'flex flex-1 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono transition-colors',
              isControlling
                ? 'border-white/10 bg-black/70 focus-within:border-emerald-500/40'
                : 'border-white/5 bg-black/50',
            )}
          >
            <Lock className="h-3 w-3 flex-shrink-0 text-emerald-500/70" />
            <input
              ref={urlInputRef}
              value={urlFocused ? urlDraft : currentUrl}
              onChange={(e) => setUrlDraft(e.target.value)}
              onFocus={() => { setUrlFocused(true); setUrlDraft(currentUrl); }}
              onBlur={() => setUrlFocused(false)}
              readOnly={!isControlling}
              spellCheck={false}
              placeholder="Search or type a URL"
              title={isControlling ? 'Type a URL and press Enter' : 'No active session'}
              className={cn(
                'flex-1 truncate bg-transparent outline-none',
                isControlling ? 'cursor-text text-zinc-200' : 'cursor-default text-zinc-500',
              )}
            />
            <RefreshCw
              className={cn('h-3 w-3 flex-shrink-0 text-zinc-600', isExecuting && 'animate-spin')}
              style={{ animationDuration: '3s' }}
            />
          </form>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" onChange={onFileSelected} className="hidden" aria-hidden="true" />

      {/* ── Viewport ──────────────────────────────────────────────────────────── */}
      <div className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-white/5 bg-black/40 crt-lines',
        fullscreen ? 'min-h-0 flex-1' : 'aspect-video',
      )}>
        {/* ── Placeholder / loading states ─────────────────────────────────── */}
        {showPlaceholder && (
          isFailed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <div className="pointer-events-none absolute inset-0 cyber-grid opacity-5" />
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
                <ShieldAlert className="h-8 w-8 text-red-400" />
              </div>
              <h4 className="font-mono text-sm font-bold tracking-wider text-red-400">EXECUTION HALTED</h4>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-400">
                {errorMessage || 'The run failed before the browser could stream. Check logs for details.'}
              </p>
            </div>
          ) : children ? (
            <div className="absolute inset-0 flex items-center justify-center">{children}</div>
          ) : isSessionStarting || isLaunching ? (
            /* Session active but no frame yet — Chromium is launching */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
              <div>
                <p className="font-mono text-sm font-bold text-emerald-400">Starting Chromium…</p>
                <p className="mt-1 text-xs text-zinc-600">Stream begins on the first frame</p>
              </div>
            </div>
          ) : (
            /* Fully idle — no session */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center px-6">
              <div className="pointer-events-none absolute inset-0 cyber-grid opacity-5" />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02]">
                <Monitor className="h-8 w-8 text-zinc-600" />
              </div>
              <div>
                <p className={cn(
                  'font-mono text-sm font-bold tracking-wider',
                  isAwaitingApproval ? 'text-amber-400' : 'text-zinc-500',
                )}>
                  {isAwaitingApproval
                    ? '🔒 AWAITING LAUNCH AUTHORIZATION'
                    : phase === 'planning'
                      ? 'COMPILING EXECUTION PLAN…'
                      : phase === 'parsing'
                        ? 'PARSING GOAL INTENT…'
                        : 'BROWSER SANDBOX'}
                </p>
                <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-600">
                  {isAwaitingApproval
                    ? 'Plan ready. The browser opens once you approve below.'
                    : 'Launch a Job Agent to activate the live stream.'}
                </p>
              </div>
            </div>
          )
        )}

        {/* ── Live canvas ───────────────────────────────────────────────────── */}
        <canvas
          ref={canvasRef}
          tabIndex={isControlling ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => isControlling && e.preventDefault()}
          className={cn(
            'absolute inset-0 h-full w-full object-contain outline-none transition-opacity',
            isControlling ? 'cursor-none' : 'cursor-default',
            showPlaceholder ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
          style={{ touchAction: isControlling ? 'none' : undefined }}
        />

        {/* Custom cursor + ripples (control mode) */}
        {isControlling && !showPlaceholder && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {clickRipples.map((r) => (
              <span
                key={r.id}
                className="absolute animate-control-ripple rounded-full border-2 border-emerald-400/80"
                style={{ left: r.x, top: r.y, width: 12, height: 12, marginLeft: -6, marginTop: -6 }}
              />
            ))}
            {cursorPos && (
              <div
                className="absolute transition-transform duration-75"
                style={{ left: cursorPos.x, top: cursorPos.y, transform: `translate(-2px,-2px) scale(${cursorDown ? 0.85 : 1})` }}
              >
                <span className={cn(
                  'absolute rounded-full bg-emerald-400/25 blur-md transition-all',
                  cursorDown ? 'h-8 w-8 -ml-4 -mt-4' : 'h-6 w-6 -ml-3 -mt-3',
                )} style={{ left: 6, top: 6 }} />
                <svg width="26" height="26" viewBox="0 0 24 24" className="relative drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">
                  <path
                    d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18.5 13.5 Z"
                    fill="#ffffff" stroke="#10b981" strokeWidth="1.4" strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* "You're driving" badge + ring */}
        {isControlling && !showPlaceholder && (
          <>
            <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-2 ring-emerald-500/50 ring-inset" />
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest text-emerald-200">
              <Hand className="h-2.5 w-2.5" />
              You&apos;re driving — click &amp; type
            </div>
          </>
        )}

        {/* Crash recovery overlay */}
        {recovery && recovery !== 'recovered' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm text-center px-6">
            {recovery === 'recovering' ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                <div>
                  <p className="font-mono text-sm font-bold text-amber-300">Browser crashed — recovering…</p>
                  <p className="mt-1 text-xs text-zinc-400">Relaunching your session and resuming where it left off</p>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert className="h-8 w-8 text-red-400" />
                <div>
                  <p className="font-mono text-sm font-bold text-red-300">Recovery failed</p>
                  <p className="mt-1 text-xs text-zinc-400">The browser could not be restored automatically.</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Recovered toast (brief) */}
        {recovery === 'recovered' && (
          <div className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest text-emerald-200">
            <RotateCw className="h-2.5 w-2.5" />
            Browser recovered
          </div>
        )}

        {/* FPS HUD pill (live only) */}
        {isLive && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-black/70 px-2.5 py-0.5 text-[9px] font-mono text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE&nbsp;&nbsp;{fps > 0 ? `${fps} fps` : '—'}&nbsp;&nbsp;
            {currentScreenshot?.width ?? 1280}×{currentScreenshot?.height ?? 800}
          </div>
        )}
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────────── */}
      <div className="mt-1.5 flex h-5 items-center px-1">
        {isLive ? (
          <p className="truncate font-mono text-[9px] text-zinc-600">
            <span className="mr-1.5 text-emerald-500">●</span>
            {fps > 0 ? `${fps} fps  ·  ` : ''}
            {currentScreenshot ? `${currentScreenshot.width}×${currentScreenshot.height}  ·  ` : ''}
            {truncateUrl(currentUrl)}
          </p>
        ) : isFailed && errorMessage ? (
          <p className="truncate font-mono text-[9px] text-red-500">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );

  if (fullscreen && typeof document !== 'undefined') {
    return createPortal(
      <div className="fixed inset-0 z-[110] flex bg-black/90 p-4 backdrop-blur-sm">
        {content}
      </div>,
      document.body,
    );
  }

  return content;
}
