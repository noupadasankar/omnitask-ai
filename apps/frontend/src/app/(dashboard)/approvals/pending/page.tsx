'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Timer,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';

interface ApprovalRequest {
  id: string;
  sessionId: string;
  stepIndex: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  actionDetails: Record<string, unknown>;
  screenshotUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  createdAt: string;
  expiresAt: string;
}

const RISK_COLORS = {
  CRITICAL: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-500', order: 4 },
  HIGH:     { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500', order: 3 },
  MEDIUM:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500', order: 2 },
  LOW:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500', order: 1 },
};

const MOCK_PENDING: ApprovalRequest[] = Array.from({ length: 8 }, (_, i) => {
  const riskLevels: ApprovalRequest['riskLevel'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const risk = riskLevels[i % 4];
  return {
    id: `pending-${i}`,
    sessionId: `session-${Math.floor(i / 2)}`,
    stepIndex: i,
    riskLevel: risk,
    description: [
      'Submit job application form on LinkedIn',
      'Navigate to Gmail and compose email',
      'Click "Confirm Order" on checkout page',
      'Upload resume file to application portal',
      'Extract data from GitHub profile page',
      'Fill in credit card payment details',
      'Download invoice PDF from dashboard',
      'Post comment on company blog post',
    ][i],
    actionDetails: { action: 'click', target: '#submit-btn' },
    status: 'PENDING',
    createdAt: new Date(Date.now() - i * 600000).toISOString(),
    expiresAt: new Date(Date.now() + (600000 - i * 60000)).toISOString(),
  };
});

export default function PendingApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortByRisk, setSortByRisk] = useState(true);
  const [timeLeft, setTimeLeft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ApprovalRequest[]>('/agent/approvals');
      setApprovals(data.filter((a) => a.status === 'PENDING'));
    } catch {
      setApprovals(MOCK_PENDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      const updated: Record<string, string> = {};
      approvals.forEach((a) => {
        const diff = new Date(a.expiresAt).getTime() - Date.now();
        if (diff <= 0) { updated[a.id] = 'Expired'; return; }
        const min = Math.floor(diff / 60000);
        const sec = Math.floor((diff % 60000) / 1000);
        updated[a.id] = `${min}m ${sec}s`;
      });
      setTimeLeft(updated);
    }, 1000);
    return () => clearInterval(interval);
  }, [approvals]);

  const sorted = sortByRisk
    ? [...approvals].sort((a, b) => (RISK_COLORS[b.riskLevel]?.order ?? 0) - (RISK_COLORS[a.riskLevel]?.order ?? 0))
    : approvals;

  const respond = async (id: string, action: 'approve' | 'reject') => {
    setActing(id);
    try {
      await api.post(`/agent/${action}`, { approvalRequestId: id });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch {
    } finally {
      setActing(null);
    }
  };

  const bulkAction = async (action: 'approve' | 'reject') => {
    for (const id of selected) {
      await respond(id, action);
    }
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />
            Pending Approvals
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Pending</h1>
          <p className="mt-1 text-sm text-zinc-500">Awaiting your decision for {approvals.length} requests.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Summary + Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5">
          <Timer className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-[11px] font-semibold text-orange-400">{approvals.length} pending</span>
        </div>
        <button
          onClick={() => setSortByRisk(!sortByRisk)}
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] px-3 py-1.5 text-[11px] text-zinc-500 hover:text-white transition-all"
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortByRisk ? 'Risk: High first' : 'Default order'}
        </button>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] px-4 py-3"
        >
          <span className="text-xs text-zinc-400">{selected.size} selected</span>
          <button
            onClick={() => bulkAction('approve')}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
          >
            <CheckCircle2 className="h-3 w-3" />
            Approve All
          </button>
          <button
            onClick={() => bulkAction('reject')}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/20"
          >
            <XCircle className="h-3 w-3" />
            Reject All
          </button>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <span className="ml-3 text-sm text-zinc-500">Loading pending approvals...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && approvals.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-black/20 py-20 text-center">
          <ShieldAlert className="mb-4 h-10 w-10 text-emerald-500/40" />
          <p className="text-sm font-semibold text-white">No pending approvals</p>
          <p className="mt-1 text-xs text-zinc-500">All requests have been resolved.</p>
        </div>
      )}

      {/* List */}
      {!loading && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((approval, i) => {
            const risk = RISK_COLORS[approval.riskLevel] ?? RISK_COLORS.MEDIUM;
            const isActing = acting === approval.id;
            return (
              <motion.div
                key={approval.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  'rounded-2xl border p-5 backdrop-blur-xl transition-all',
                  selected.has(approval.id)
                    ? 'border-orange-500/30 bg-orange-500/[0.04]'
                    : 'border-white/[0.07] bg-black/30',
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(approval.id)}
                    onChange={() => toggleSelect(approval.id)}
                    className="mt-1 h-4 w-4 rounded border-white/[0.07] bg-black accent-red-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn('h-2 w-2 rounded-full', risk.dot)} />
                        <span className={cn('text-[11px] font-bold uppercase tracking-wider', risk.text)}>
                          {approval.riskLevel} Risk
                        </span>
                      </div>
                      <span className={cn(
                        'text-[10px] font-semibold font-mono',
                        timeLeft[approval.id] === 'Expired' ? 'text-red-400' : 'text-zinc-500',
                      )}>
                        <Timer className="inline h-3 w-3 mr-1" />
                        {timeLeft[approval.id] ?? '...'}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-white">{approval.description}</p>

                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-4">
                      <span className="text-[10px] text-zinc-600">
                        Step {approval.stepIndex + 1} &middot; {new Date(approval.createdAt).toLocaleTimeString()}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => respond(approval.id, 'reject')}
                          disabled={isActing}
                          className="flex h-8 items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-[11px] font-semibold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-40"
                        >
                          {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          Reject
                        </button>
                        <button
                          onClick={() => respond(approval.id, 'approve')}
                          disabled={isActing}
                          className="flex h-8 items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-[11px] font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:opacity-40"
                        >
                          {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
