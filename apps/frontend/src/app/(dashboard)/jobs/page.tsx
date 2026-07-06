'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Briefcase,
  Rocket,
  Loader2,
  Square,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveBrowserView } from '@/components/execution/LiveBrowserView';
import { ApprovalPanel } from '@/components/execution/ApprovalPanel';
import { useJobAgentSession } from '@/hooks/useJobAgentSession';
import { JobAgentStatus } from '@/components/jobs/JobAgentStatus';
import { stopJobAgent } from '@/services/job.service';
import { JobWizardModal, type JobWizardResult } from '@/components/jobs/JobWizardModal';

function JobsInner() {
  const searchParams = useSearchParams();

  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(
    () => searchParams?.get('session') ?? null,
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [engineOffline, setEngineOffline] = useState(false);

  const {
    phase,
    currentScreenshot,
    applications,
    queueState,
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
      router.push('/dashboard');
    }
  };

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

          {/* Live agent + job-queue status (only when a session is active) */}
          {sessionId && (
            <section className="border-t border-white/[0.07] pt-4">
              <JobAgentStatus
                phase={phase}
                applications={applications}
                queueState={queueState}
                target={queueState?.total ?? 0}
              />
            </section>
          )}
        </div>

        {/* Right: browser + approval */}
        <div className="flex flex-1 min-w-0 flex-col gap-3 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
            <LiveBrowserView
              currentScreenshot={currentScreenshot}
              phase={phase}
              sessionId={sessionId}
              errorMessage={errorMessage}
            />

            {pendingApproval && (
              <div className="mt-3">
                <ApprovalPanel
                  pendingApproval={pendingApproval}
                  onApprove={approve}
                  onDeny={deny}
                />
              </div>
            )}
          </div>
        </div>
      </div>
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
