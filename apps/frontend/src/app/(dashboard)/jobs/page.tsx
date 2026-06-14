'use client';

import React, { useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Briefcase,
  Rocket,
  Loader2,
  Square,
  Activity,
  CheckCircle2,
  SkipForward,
  Building2,
  ChevronDown,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveBrowserView } from '@/components/execution/LiveBrowserView';
import { ApprovalPanel } from '@/components/execution/ApprovalPanel';
import { useJobAgentSession } from '@/hooks/useJobAgentSession';
import { stopJobAgent } from '@/services/job.service';
import { JobWizardModal, type JobWizardResult } from '@/components/jobs/JobWizardModal';

function JobsInner() {
  const searchParams = useSearchParams();

  const [sessionId, setSessionId] = useState<string | null>(
    () => searchParams?.get('session') ?? null,
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [engineOffline, setEngineOffline] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  const {
    phase,
    currentScreenshot,
    applications,
    logs,
    pendingApproval,
    errorMessage,
    approve,
    deny,
  } = useJobAgentSession(sessionId);

  const running = phase === 'planning' || phase === 'executing';

  const onLaunched = (result: JobWizardResult) => {
    setSessionId(result.sessionId);
    setEngineOffline(!result.dispatched);
    setWizardOpen(false);
  };

  const onStop = async () => {
    if (!sessionId) return;
    setStopping(true);
    try {
      await stopJobAgent(sessionId);
    } catch {
      /* winds down on next candidate */
    } finally {
      setStopping(false);
    }
  };

  const stats = useMemo(() => {
    const applied = applications.filter((a) => a.status === 'APPLIED').length;
    const skipped = applications.filter((a) => a.status === 'SKIPPED').length;
    const failed = applications.filter((a) => a.status === 'FAILED').length;
    const pending = applications.find((a) => a.status === 'PENDING_APPROVAL');
    const latest = applications[applications.length - 1];
    const current = pending ?? latest;
    return { applied, skipped, failed, current };
  }, [applications]);

  const statusLabel =
    phase === 'completed' ? 'Completed' :
    phase === 'failed' ? 'Failed' :
    running ? 'Running' : 'Idle';

  return (
    <>
    <JobWizardModal
      open={wizardOpen}
      taskText=""
      onClose={() => setWizardOpen(false)}
      onLaunched={onLaunched}
    />

    <div className="-m-6 lg:-m-8 flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 80px)' }}>

      {/* ── Slim header ─────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.07] bg-black/20 px-6 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
          <Briefcase className="h-4 w-4 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-white leading-none">Job Application Agent</h1>
          <p className="mt-0.5 text-[11px] text-zinc-500 leading-none">
            Autonomous apply · live browser view · approve-before-submit
          </p>
        </div>

        {/* Status pill */}
        <div className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold',
          running
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : phase === 'failed'
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : phase === 'completed'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                : 'border-white/10 bg-white/[0.03] text-zinc-500',
        )}>
          <Activity className={cn('h-3 w-3', running && 'animate-pulse')} />
          {statusLabel}
        </div>
      </div>

      {/* ── Main: sidebar + browser ──────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar */}
        <div className="flex w-[272px] flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/[0.07] bg-black/10 p-4">

          {/* Launch / Stop */}
          <section>
            <p className="mb-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
              Job Agent
            </p>

            {running ? (
              <button
                onClick={onStop}
                disabled={stopping}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-300 transition-all hover:bg-red-500/20 disabled:opacity-50"
              >
                {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                {stopping ? 'Stopping…' : 'Stop Agent'}
              </button>
            ) : (
              <button
                onClick={() => setWizardOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 hover:scale-[1.02]"
              >
                <Rocket className="h-4 w-4" />
                Launch Job Agent
              </button>
            )}

            {engineOffline && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                Python engine offline — queued.
              </p>
            )}
          </section>

          {/* Live stats (only when session active) */}
          {sessionId && (
            <section className="border-t border-white/[0.07] pt-4">
              <p className="mb-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                Live Stats
              </p>

              {/* Counters */}
              <div className="grid grid-cols-3 gap-2">
                <StatBox icon={CheckCircle2} label="Applied" value={stats.applied} tone="emerald" />
                <StatBox icon={SkipForward} label="Skipped" value={stats.skipped} tone="zinc" />
                <StatBox icon={Building2} label="Failed" value={stats.failed} tone="red" />
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>Progress</span>
                  <span className="text-zinc-300">{stats.applied} applied</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, stats.applied * 10)}%` }}
                  />
                </div>
              </div>

              {/* Current job */}
              {stats.current && (
                <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/30 p-3">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Now</p>
                  <p className="mt-1 truncate text-[12px] font-medium text-zinc-100">
                    {stats.current.title || '—'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span className="truncate">{stats.current.company || 'Unknown'}</span>
                    {stats.current.portal && (
                      <span className="rounded bg-white/[0.04] px-1 py-0.5 font-mono capitalize text-zinc-400">
                        {stats.current.portal}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right: browser + approval */}
        <div className="flex flex-1 min-w-0 flex-col gap-3 overflow-y-auto p-4">
          <LiveBrowserView
            currentScreenshot={currentScreenshot}
            phase={phase}
            sessionId={sessionId}
            errorMessage={errorMessage}
          />

          {pendingApproval && (
            <ApprovalPanel
              pendingApproval={pendingApproval}
              onApprove={approve}
              onDeny={deny}
            />
          )}
        </div>
      </div>

      {/* ── Collapsible logs ─────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/[0.07] bg-black/20">
          <button
            onClick={() => setLogsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Bot className="h-3 w-3" />
              Agent Log
              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-zinc-500">{logs.length}</span>
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', logsOpen && 'rotate-180')} />
          </button>

          {logsOpen && (
            <div className="max-h-36 overflow-y-auto px-4 pb-3 font-mono text-[11px] space-y-0.5">
              {logs.slice().reverse().map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    l.level === 'error' && 'text-red-400',
                    l.level === 'warn' && 'text-amber-400',
                    l.level === 'success' && 'text-emerald-400',
                    (!l.level || l.level === 'info') && 'text-zinc-500',
                  )}
                >
                  {l.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsInner />
    </Suspense>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: 'emerald' | 'zinc' | 'red';
}) {
  const color =
    tone === 'emerald' ? 'text-emerald-400' :
    tone === 'red' ? 'text-red-400' :
    'text-zinc-300';
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/30 p-2 text-center">
      <Icon className={cn('mx-auto mb-1 h-3 w-3', color)} />
      <div className={cn('text-sm font-bold', color)}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}
