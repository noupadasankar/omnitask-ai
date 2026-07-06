'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ShieldCheck,
  Clock,
  RefreshCw,
  Loader2,
  AlertTriangle,
  User,
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
  status: 'APPROVED';
  createdAt: string;
  updatedAt?: string;
  approvedBy?: string;
}

const RISK_COLORS = {
  CRITICAL: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  HIGH:     { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  LOW:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

const MOCK_APPROVED: ApprovalRequest[] = Array.from({ length: 12 }, (_, i) => {
  const riskLevels: ApprovalRequest['riskLevel'][] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const risk = riskLevels[i % 4];
  return {
    id: `approved-${i}`,
    sessionId: `session-${Math.floor(i / 3)}`,
    stepIndex: i,
    riskLevel: risk,
    description: [
      'Navigate to Google and search for query',
      'Extract contact info from company page',
      'Submit contact form on website',
      'Login to GitHub and clone repository',
      'Fill in job application on Indeed',
      'Download report from analytics dashboard',
      'Post message to Slack channel',
      'Create Jira ticket for bug report',
      'Update DNS records on Cloudflare',
      'Deploy build to staging environment',
      'Run database migration script',
      'Send weekly newsletter via Mailchimp',
    ][i],
    actionDetails: {},
    status: 'APPROVED',
    createdAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - i * 86400000 * 2 + 300000).toISOString(),
    approvedBy: ['You', 'Alice Chen', 'Bob Martinez', 'System'][i % 4],
  };
});

export default function ApprovedApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ApprovalRequest[]>('/agent/approvals');
      setApprovals(data.filter((a) => a.status === 'APPROVED'));
    } catch {
      setApprovals(MOCK_APPROVED);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const avgResponseTime = approvals.length > 0
    ? approvals.reduce((sum, a) => {
        const created = new Date(a.createdAt).getTime();
        const updated = a.updatedAt ? new Date(a.updatedAt).getTime() : created + 300000;
        return sum + (updated - created);
      }, 0) / approvals.length
    : 0;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Approval History
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Approved</h1>
          <p className="mt-1 text-sm text-zinc-500">History of approved action requests.</p>
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
        <SummaryCard icon={CheckCircle2} label="Total Approved" value={approvals.length} color="text-emerald-400" />
        <SummaryCard icon={Clock} label="Avg Response" value={`${Math.round(avgResponseTime / 1000 / 60)}m`} color="text-blue-400" />
        <SummaryCard icon={ShieldCheck} label="Approval Rate" value={approvals.length > 0 ? '100%' : '0%'} color="text-purple-400" />
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
          <span className="ml-3 text-sm text-zinc-500">Loading approved approvals...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && approvals.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-black/20 py-20 text-center">
          <CheckCircle2 className="mb-4 h-10 w-10 text-zinc-600" />
          <p className="text-sm font-semibold text-white">No approved approvals yet</p>
          <p className="mt-1 text-xs text-zinc-500">Approved requests will appear here.</p>
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
                transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-emerald-500/10 bg-black/30 p-5 backdrop-blur-xl"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        APPROVED
                      </span>
                      <span className={cn('text-[10px] font-semibold', risk.text)}>
                        {approval.riskLevel}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white">{approval.description}</p>
                    <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-500">
                      <span>Step {approval.stepIndex + 1}</span>
                      <span>{new Date(approval.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
                    {approval.approvedBy && (
                      <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/[0.04] px-2.5 py-1">
                        <User className="h-3 w-3 text-emerald-400" />
                        <span className="text-[10px] font-medium text-emerald-300">{approval.approvedBy}</span>
                      </div>
                    )}
                    {approval.updatedAt && (
                      <span className="text-[10px] text-zinc-600">{timeAgo(approval.updatedAt)}</span>
                    )}
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
