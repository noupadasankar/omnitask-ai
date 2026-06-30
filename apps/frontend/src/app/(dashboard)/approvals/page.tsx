'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, CheckCircle2, XCircle,
  Clock, RefreshCw, Loader2, AlertTriangle,
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
  CRITICAL: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  HIGH:     { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  LOW:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ApprovalRequest[]>('/agent/approvals');
      setApprovals(data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const respond = async (id: string, action: 'approve' | 'reject') => {
    setActing(id);
    try {
      await api.post(`/agent/${action}`, { approvalRequestId: id });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      setError(e.response?.data?.message ?? `Failed to ${action}`);
    } finally {
      setActing(null);
    }
  };

  const pending  = approvals.filter((a) => a.status === 'PENDING');
  const approved = approvals.filter((a) => a.status === 'APPROVED');
  const denied   = approvals.filter((a) => a.status === 'DENIED');

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-red-400" />
            Approval Center
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Pending Approvals</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review and approve autonomous agent actions before they execute.
          </p>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Clock,       label: 'Pending',  value: pending.length,  cls: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10' },
          { icon: CheckCircle2, label: 'Approved', value: approved.length, cls: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' },
          { icon: XCircle,     label: 'Denied',   value: denied.length,   cls: 'text-red-400 border-red-500/20 bg-red-500/10' },
        ].map(({ icon: Icon, label, value, cls }) => (
          <div key={label} className={cn('flex items-center justify-between rounded-2xl border px-4 py-3', cls)}>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="text-[11px] font-medium">{label}</span>
            </div>
            <span className="text-lg font-bold text-white">{value}</span>
          </div>
        ))}
      </div>

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
          <span className="ml-3 text-sm text-zinc-500">Loading approvals…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && approvals.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-black/20 py-20 text-center">
          <ShieldCheck className="mb-4 h-10 w-10 text-emerald-500/40" />
          <p className="text-sm font-semibold text-white">All clear</p>
          <p className="mt-1 text-xs text-zinc-500">No pending approval requests from the agent.</p>
        </div>
      )}

      {/* Approval cards */}
      {!loading && pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Awaiting your decision</p>
          {pending.map((approval, i) => {
            const risk = RISK_COLORS[approval.riskLevel] ?? RISK_COLORS.MEDIUM;
            const isActing = acting === approval.id;
            return (
              <motion.div
                key={approval.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('h-2 w-2 rounded-full', risk.dot)} />
                    <span className={cn('text-[11px] font-bold uppercase tracking-wider', risk.text)}>
                      {approval.riskLevel} Risk
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-600">
                    Step {approval.stepIndex + 1} · {new Date(approval.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                <p className="text-sm font-semibold text-white">{approval.description}</p>

                {Object.keys(approval.actionDetails).length > 0 && (
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-white/[0.05] bg-black/40 p-3 font-mono text-[10px] text-zinc-400">
                    {JSON.stringify(approval.actionDetails, null, 2)}
                  </pre>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-4">
                  <span className="text-[10px] text-zinc-700">
                    Expires {new Date(approval.expiresAt).toLocaleTimeString()}
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
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Resolved (informational) */}
      {!loading && (approved.length > 0 || denied.length > 0) && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Recently resolved</p>
          {[...approved, ...denied].map((approval) => (
            <div key={approval.id} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3">
              <p className="text-xs text-zinc-400 line-clamp-1">{approval.description}</p>
              <span className={cn(
                'ml-4 flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold',
                approval.status === 'APPROVED'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-red-500/20 bg-red-500/10 text-red-400',
              )}>
                {approval.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
