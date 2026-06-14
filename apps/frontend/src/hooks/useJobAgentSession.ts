'use client';

import { useCallback, useEffect, useState } from 'react';
import { wsService } from '@/services/websocket.service';
import type { ApprovalRequest, ScreenshotFrame } from '@/types/agent';
import type { JobApplication } from '@/services/job.service';

export type JobAgentPhase = 'idle' | 'planning' | 'executing' | 'completed' | 'failed';

export interface JobLogEntry {
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
  at: number;
}

/** A live application row, keyed by portal+externalJobId (last status wins). */
export interface LiveApplication {
  portal: string;
  externalJobId: string;
  title?: string;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  score?: number;
  status: JobApplication['status'];
  error?: string;
}

const appKey = (a: { portal?: string; externalJobId?: string }) =>
  `${a.portal ?? ''}:${a.externalJobId ?? ''}`;

/** Live job-queue counts emitted by the agent worker (`queue:state`). */
export interface QueueState {
  PENDING: number;
  PROCESSING: number;
  COMPLETED: number;
  FAILED: number;
  SKIPPED: number;
  total: number;
}

/**
 * Subscribe to a job-application run's live events on the `/agent` namespace.
 *
 * Mirrors the locked-in frame-drop-safe pattern: the subscription effect depends
 * ONLY on stable values (sessionId + connection), and every handler uses
 * functional setState so incoming frames never tear down the listeners.
 */
export function useJobAgentSession(sessionId: string | null) {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<JobAgentPhase>('idle');
  const [currentScreenshot, setCurrentScreenshot] = useState<ScreenshotFrame | null>(null);
  const [applications, setApplications] = useState<LiveApplication[]>([]);
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [logs, setLogs] = useState<JobLogEntry[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Ensure the shared socket is connected (idempotent — only connects if needed).
  useEffect(() => {
    let cancelled = false;
    if (wsService.isConnected()) {
      setConnected(true);
      return;
    }
    wsService
      .connect(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api')
      .then(() => !cancelled && setConnected(true))
      .catch(() => !cancelled && setConnected(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Join the session room and wire event handlers. Stable deps only.
  useEffect(() => {
    if (!sessionId || !connected) return;

    // Fresh run → clear prior state.
    setPhase('planning');
    setCurrentScreenshot(null);
    setApplications([]);
    setQueueState(null);
    setLogs([]);
    setPendingApproval(null);
    setErrorMessage(null);

    const userId =
      (typeof window !== 'undefined' && localStorage.getItem('userId')) || '';
    wsService.joinSession(sessionId, userId);

    const pushLog = (message: string, level: JobLogEntry['level'] = 'info') =>
      setLogs((prev) => [...prev.slice(-300), { message, level, at: Date.now() }]);

    const offs = [
      wsService.on('screenshot:frame', (d: ScreenshotFrame) => {
        setCurrentScreenshot(d);
        setPhase((p) => (p === 'planning' ? 'executing' : p));
      }),

      wsService.on('application:result', (d: any) => {
        const row: LiveApplication = {
          portal: String(d.portal ?? ''),
          externalJobId: String(d.externalJobId ?? ''),
          title: d.title,
          company: d.company ?? null,
          location: d.location ?? null,
          url: d.url ?? null,
          score: typeof d.score === 'number' ? d.score : Number(d.score) || 0,
          status: d.status,
          error: d.error,
        };
        setApplications((prev) => {
          const key = appKey(row);
          const next = prev.filter((a) => appKey(a) !== key);
          next.push(row);
          return next;
        });
      }),

      wsService.on('queue:state', (d: any) => {
        const c = d?.counts ?? {};
        setQueueState({
          PENDING: Number(c.PENDING) || 0,
          PROCESSING: Number(c.PROCESSING) || 0,
          COMPLETED: Number(c.COMPLETED) || 0,
          FAILED: Number(c.FAILED) || 0,
          SKIPPED: Number(c.SKIPPED) || 0,
          total: Number(c.total) || 0,
        });
      }),

      wsService.on('approval:requested', (d: any) => {
        setPendingApproval({
          id: d.approvalRequestId,
          stepIndex: d.stepIndex,
          riskLevel: d.riskLevel,
          actionDetails: d.actionDetails,
          expiresAt: d.expiresAt,
        });
      }),

      wsService.on('approval:responded', () => setPendingApproval(null)),
      wsService.on('approval:expired', () => setPendingApproval(null)),

      wsService.on('execution:event', (d: any) => {
        if (typeof d?.type === 'string' && d.type.startsWith('log:')) {
          const level = d.type.split(':')[1] as JobLogEntry['level'];
          pushLog(d.data?.message ?? '', level || 'info');
        }
      }),

      wsService.on('execution:completed', () => {
        setPhase('completed');
        setPendingApproval(null);
      }),

      wsService.on('execution:failed', (d: any) => {
        setPhase('failed');
        setPendingApproval(null);
        setErrorMessage(d?.message || 'The job agent run failed.');
      }),
    ];

    return () => {
      offs.forEach((off) => off());
      wsService.leaveSession(sessionId);
    };
  }, [sessionId, connected]);

  const approve = useCallback((id: string) => {
    wsService.sendApprovalResponse(id, 'APPROVED');
    setPendingApproval(null);
  }, []);

  const deny = useCallback((id: string) => {
    wsService.sendApprovalResponse(id, 'DENIED');
    setPendingApproval(null);
  }, []);

  return {
    connected,
    phase,
    currentScreenshot,
    applications,
    queueState,
    logs,
    pendingApproval,
    errorMessage,
    approve,
    deny,
  };
}
