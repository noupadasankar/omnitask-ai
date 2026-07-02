'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward,
  ChevronsLeft, ChevronsRight, Clock,
  Camera, Monitor, CheckCircle2,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useTask } from '@/hooks/useTasks';
import { ExecutionReplay } from '@/components/tasks/ExecutionReplay';

interface ReplayFrame {
  base64: string;
  stepIndex: number;
  timestamp: number;
  description?: string;
  action?: string;
  status?: string;
  url?: string;
}

interface ReplayStep {
  index: number;
  action: string;
  status: string;
  duration?: number;
}

const MOCK_FRAMES: ReplayFrame[] = [
  { base64: '', stepIndex: 0, timestamp: Date.now() - 30000, description: 'Navigating to amazon.com', action: 'navigate', status: 'completed', url: 'https://www.amazon.com' },
  { base64: '', stepIndex: 1, timestamp: Date.now() - 25000, description: 'Searching for "noise cancelling headphones"', action: 'search', status: 'completed', url: 'https://www.amazon.com/s?k=noise+cancelling+headphones' },
  { base64: '', stepIndex: 2, timestamp: Date.now() - 20000, description: 'Extracting product list from results', action: 'extract', status: 'completed', url: 'https://www.amazon.com/s?k=noise+cancelling+headphones' },
  { base64: '', stepIndex: 3, timestamp: Date.now() - 15000, description: 'Opening product page for Sony WH-1000XM5', action: 'click', status: 'completed', url: 'https://www.amazon.com/dp/B09Y2T6W7X' },
  { base64: '', stepIndex: 4, timestamp: Date.now() - 10000, description: 'Extracting product details and price', action: 'extract', status: 'completed', url: 'https://www.amazon.com/dp/B09Y2T6W7X' },
  { base64: '', stepIndex: 5, timestamp: Date.now() - 5000, description: 'Adding to cart', action: 'click', status: 'running', url: 'https://www.amazon.com/dp/B09Y2T6W7X' },
];

const MOCK_STEPS: ReplayStep[] = [
  { index: 0, action: 'Navigate to amazon.com', status: 'completed', duration: 3500 },
  { index: 1, action: 'Search for product', status: 'completed', duration: 2800 },
  { index: 2, action: 'Extract product list', status: 'completed', duration: 4200 },
  { index: 3, action: 'Click product link', status: 'completed', duration: 1800 },
  { index: 4, action: 'Extract product details', status: 'completed', duration: 3100 },
  { index: 5, action: 'Add to cart', status: 'running', duration: undefined },
];

export default function TaskReplayPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: task } = useTask(id);

  const [frames] = useState<ReplayFrame[]>(MOCK_FRAMES);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [canvasMode, setCanvasMode] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const sessionId = searchParams.get('sessionId');

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const delay = 1500 / speed;
    intervalRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delay);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, frames.length, speed]);

  const frame = frames[currentStep];

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => window.history.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
              <Camera className="h-3.5 w-3.5 text-purple-400" />
              Replay
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Execution Replay</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {task?.title || `Task #${id?.slice(0, 8)}`} — step-by-step browser replay
            </p>
          </div>
        </div>
        {sessionId && (
          <div className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-[10px] text-zinc-600 font-mono">
            Session: {sessionId.slice(0, 8)}...
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Player */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 backdrop-blur-xl overflow-hidden">
          {/* View mode toggle */}
          <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {canvasMode ? 'Canvas Replay' : 'Step Viewer'}
            </span>
            <button
              onClick={() => setCanvasMode(!canvasMode)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all',
                canvasMode
                  ? 'bg-purple-500/10 border border-purple-500/20 text-purple-400'
                  : 'text-zinc-600 hover:text-zinc-400',
              )}
            >
              {canvasMode ? 'Standard View' : 'Canvas View'}
            </button>
          </div>

          {canvasMode ? (
            <div className="h-[400px]">
              <ExecutionReplay
                frames={frames.filter((f) => f.base64).map((f) => ({
                  base64: f.base64,
                  stepIndex: f.stepIndex,
                  timestamp: f.timestamp,
                  description: f.description,
                  action: f.action,
                  status: f.status,
                }))}
              />
            </div>
          ) : (
            <>
              {/* Display */}
              <div className="relative aspect-video bg-black/60 flex items-center justify-center border-b border-white/[0.05]">
                {frame?.base64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${frame.base64}`}
                    alt={`Step ${frame.stepIndex}`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-zinc-700">
                    <Monitor className="h-16 w-16" />
                    <p className="text-sm font-medium">Browser Preview</p>
                    {frame && (
                      <p className="text-[10px] text-zinc-600 font-mono">{frame.url}</p>
                    )}
                  </div>
                )}

                {/* Step overlay */}
                <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2.5 py-1 text-[10px] text-zinc-400 font-mono">
                  Step {currentStep + 1} / {frames.length}
                </div>

                {frame?.description && (
                  <div className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2.5 py-1 text-[10px] text-zinc-400 max-w-[60%] truncate">
                    {frame.description}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="p-4 space-y-4">
                {/* Playback buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setCurrentStep(0); setIsPlaying(false); }}
                    disabled={currentStep === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-30"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setCurrentStep((p) => Math.max(0, p - 1)); setIsPlaying(false); }}
                    disabled={currentStep === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-30"
                  >
                    <SkipBack className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                      isPlaying
                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20',
                    )}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                  </button>

                  <button
                    onClick={() => { setCurrentStep((p) => Math.min(frames.length - 1, p + 1)); setIsPlaying(false); }}
                    disabled={currentStep >= frames.length - 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-30"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setCurrentStep(frames.length - 1); setIsPlaying(false); }}
                    disabled={currentStep >= frames.length - 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-30"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>

                  {/* Speed */}
                  <div className="ml-auto flex items-center gap-1">
                    {[0.5, 1, 2, 4].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-[10px] font-mono font-semibold transition-all',
                          speed === s
                            ? 'bg-purple-500/10 border border-purple-500/20 text-purple-400'
                            : 'text-zinc-600 hover:text-zinc-400',
                        )}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step scrubber */}
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={0}
                    max={frames.length - 1}
                    value={currentStep}
                    onChange={(e) => { setCurrentStep(parseInt(e.target.value)); setIsPlaying(false); }}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex items-center justify-between text-[9px] text-zinc-600 font-mono">
                    <span>0:00</span>
                    <span>{frame?.timestamp ? formatDate(new Date(frame.timestamp)) : '—'}</span>
                    <span>{Math.floor(frames.length * 1.5 / speed)}s</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Steps sidebar */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <h3 className="text-xs font-semibold text-white mb-4">Step Timeline</h3>
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {MOCK_STEPS.map((step, i) => {
              const isActive = i === currentStep;
              const isCompleted = step.status === 'completed' && i <= currentStep;
              const _isPending = i > currentStep;
              return (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => { setCurrentStep(i); setIsPlaying(false); }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                    isActive
                      ? 'border-purple-500/30 bg-purple-500/10'
                      : isCompleted
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03]',
                  )}
                >
                  {/* Step number */}
                  <div className={cn(
                    'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[9px] font-mono font-bold border',
                    isActive ? 'border-purple-500/30 bg-purple-500/20 text-purple-400' :
                    isCompleted ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400' :
                    'border-zinc-700 bg-zinc-800 text-zinc-600',
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      i + 1
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'truncate text-[11px] font-medium',
                      isActive ? 'text-purple-300' : isCompleted ? 'text-zinc-300' : 'text-zinc-600',
                    )}>
                      {step.action}
                    </p>
                    {step.duration && (
                      <p className="text-[9px] text-zinc-600 font-mono mt-0.5">
                        {(step.duration / 1000).toFixed(1)}s
                      </p>
                    )}
                  </div>

                  {isActive && (
                    <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
                  )}
                  {isCompleted && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                  )}
                </motion.button>
              );
            })}
          </div>

          {frames.length > 0 && (
            <div className="mt-4 rounded-xl bg-white/[0.02] p-3">
              <p className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <Camera className="h-3 w-3" />
                {frames.length} frames captured
              </p>
              <p className="flex items-center gap-1.5 text-[10px] text-zinc-600 mt-1">
                <Clock className="h-3 w-3" />
                Total duration: ~{Math.floor(frames.length * 1.5)}s
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
