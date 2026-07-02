'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  XCircle,
  ShieldX,
  Clock,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import { timeAgo } from '@/lib/utils';

interface ApprovalRequest {
  id: string;
  sessionId: string;
  stepIndex: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  actionDetails: Record<string, unknown>;
  status: 'DENIED';
  createdAt: string;
  updatedAt?: string;
  reason?: string;
}

const RISK_COLORS = {
  CRITICAL: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  HIGH:     { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  LOW:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

const MOCK_REJECTED: ApprovalRequest[] = Array.from({ length: 7 }, (_, i) => {
  const riskLevels: ApprovalRequest['riskLevel'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const risk = riskLevels[i % 4];
  return {
    id: `rejected-${i}`,
    sessionId: `session-${Math.floor(i / 2)}`,
    stepIndex: i,
    riskLevel: risk,
    description: [
      'Submit payment on checkout page',
      'Login to banking portal',
      'Upload personal documents to third-party site',
      'Delete user account from admin panel',
      'Send bulk email to mailing list',
      'Access internal admin credentials page',
      'Execute database DELETE query',
    ][i],
    actionDetails: {},
    status: 'DENIED',
    createdAt: new Date(Date.now() - i * 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - i * 86400000 * 3 + 120000).toISOString(),
    reason: [
      'Payment action requires manual review',
      'Sensitive domain not in whitelist',
      'Upload exceeds allowed file size',
      'Account deletion requires admin confirmation',
      'Bulk email requires approval from manager',
      'Admin panel access restricted',
      'Database write operations not permitted',
    ][i],
  };
});

export default function RejectedApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ApprovalRequest[]>('/agent/approvals');
      setApprovals(data.filter((a) => a.status === 'DENIED'));
    } catch {
      setApprovals(MOCK_REJECTED);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const _totalRequests = 0; // We don't track total here for now
  const _rejectionRate = '100%'; // All shown here are rejected

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <XCircle className="h-3.5 w-3.5 text-red-400" />
            Rejected History
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Rejected</h1>
          <p className="mt-1 text-sm text-zinc-500">Actions that were denied by the approval layer.</p>
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

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon={Ban} label="Total Rejected" value={approvals.length} color="text-red-400" />
        <SummaryCard icon={ShieldX} label="Rejection Rate" value={approvals.length > 0 ? '100%' : '0%'} color="text-orange-400" />
        <SummaryCard icon={Clock} label="Last Rejected" value={approvals.length > 0 ? timeAgo(approvals[0].updatedAt ?? approvals[0].createdAt) : '-'} color="text-zinc-400" />
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
          <span className="ml-3 text-sm text-zinc-500">Loading rejected approvals...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && approvals.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-black/20 py-20 text-center">
          <ShieldX className="mb-4 h-10 w-10 text-emerald-500/40" />
          <p className="text-sm font-semibold text-white">No rejected approvals</p>
          <p className="mt-1 text-xs text-zinc-500">All requests have been accepted so far.</p>
        </div>
      )}

      {/* List */}
      {!loading && approvals.length > 0 && (
        <div className="space-y-3">
          {approvals.map((approval, i) => {
            const risk = RISK_COLORS[approval.riskLevel] ?? RISK_COLORS.MEDIUM;
            return (
              <motion.div
                key={approval.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl border border-red-500/10 bg-black/30 p-5 backdrop-blur-xl"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
                        REJECTED
                      </span>
                      <span className={cn('text-[10px] font-semibold', risk.text)}>
                        {approval.riskLevel}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white">{approval.description}</p>

                    {approval.reason && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/10 bg-red-500/[0.03] px-3 py-2">
                        <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-red-300/80">{approval.reason}</p>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-500">
                      <span>Step {approval.stepIndex + 1}</span>
                      <span>{new Date(approval.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {approval.updatedAt && <span>Rejected {timeAgo(approval.updatedAt)}</span>}
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

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl">
      <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
