'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ShieldCheck, Shield, ShieldAlert, AlertTriangle,
  Clock, CheckCircle2, XCircle, HelpCircle, RefreshCw,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { useTask } from '@/hooks/useTasks';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface ApprovalEntry {
  id: string;
  riskLevel: RiskLevel;
  description: string;
  action: string;
  target?: string;
  status: ApprovalStatus;
  stepIndex?: number;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

const MOCK_APPROVALS: ApprovalEntry[] = [
  {
    id: 'a1', riskLevel: 'low', description: 'Navigate to amazon.com',
    action: 'navigate', target: 'https://www.amazon.com',
    status: 'approved', stepIndex: 1,
    createdAt: new Date(Date.now() - 120000).toISOString(),
    resolvedAt: new Date(Date.now() - 119000).toISOString(), resolvedBy: 'user@example.com',
  },
  {
    id: 'a2', riskLevel: 'medium', description: 'Search for "noise cancelling headphones"',
    action: 'search', target: 'amazon.com search bar',
    status: 'approved', stepIndex: 2,
    createdAt: new Date(Date.now() - 100000).toISOString(),
    resolvedAt: new Date(Date.now() - 98000).toISOString(), resolvedBy: 'user@example.com',
  },
  {
    id: 'a3', riskLevel: 'high', description: 'Extract product pricing data from results page',
    action: 'extract', target: 'search results page',
    status: 'approved', stepIndex: 3,
    createdAt: new Date(Date.now() - 80000).toISOString(),
    resolvedAt: new Date(Date.now() - 77000).toISOString(), resolvedBy: 'user@example.com',
  },
  {
    id: 'a4', riskLevel: 'critical', description: 'Add item to cart — will proceed to checkout',
    action: 'click', target: 'Add to Cart button',
    status: 'pending', stepIndex: 4,
    createdAt: new Date(Date.now() - 30000).toISOString(),
  },
  {
    id: 'a5', riskLevel: 'high', description: 'Proceed to checkout with cart total $348.00',
    action: 'navigate', target: 'checkout page',
    status: 'pending', stepIndex: 5,
    createdAt: new Date(Date.now() - 25000).toISOString(),
  },
  {
    id: 'a6', riskLevel: 'medium', description: 'Fill shipping address form',
    action: 'fill_form', target: 'shipping form',
    status: 'rejected', stepIndex: 6,
    createdAt: new Date(Date.now() - 20000).toISOString(),
    resolvedAt: new Date(Date.now() - 15000).toISOString(), resolvedBy: 'user@example.com',
  },
  {
    id: 'a7', riskLevel: 'low', description: 'Select payment method',
    action: 'select', target: 'payment dropdown',
    status: 'expired', stepIndex: 7,
    createdAt: new Date(Date.now() - 600000).toISOString(),
    resolvedAt: new Date(Date.now() - 300000).toISOString(),
  },
];

const RISK_CONFIG: Record<RiskLevel, {
  label: string; icon: React.ElementType; color: string; bg: string; border: string;
}> = {
  low:      { label: 'Low Risk', icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  medium:   { label: 'Medium Risk', icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  high:     { label: 'High Risk', icon: ShieldAlert, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  critical: { label: 'Critical Risk', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
};

const STATUS_CONFIG: Record<ApprovalStatus, {
  label: string; icon: React.ElementType; color: string; bg: string;
}> = {
  pending:  { label: 'Pending', icon: HelpCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  expired:  { label: 'Expired', icon: Clock, color: 'text-zinc-500', bg: 'bg-zinc-500/10' },
};

export default function TaskApprovalsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task } = useTask(id);
  const [filter, setFilter] = useState<ApprovalStatus | 'all'>('all');
  const [approvals, setApprovals] = useState<ApprovalEntry[]>(MOCK_APPROVALS);

  const filtered = useMemo(() => {
    if (filter === 'all') return approvals;
    return approvals.filter((a) => a.status === filter);
  }, [approvals, filter]);

  const summary = useMemo(() => {
    const total = approvals.length;
    const pending = approvals.filter((a) => a.status === 'pending').length;
    const approved = approvals.filter((a) => a.status === 'approved').length;
    const rejected = approvals.filter((a) => a.status === 'rejected').length;
    const rate = total > 0 ? Math.round((approved / (approved + rejected)) * 100) : 0;
    return { total, pending, approved, rejected, rate };
  }, [approvals]);

  const handleResubmit = (e: React.MouseEvent, approvalId: string) => {
    e.stopPropagation();
    setApprovals((prev) =>
      prev.map((a) =>
        a.id === approvalId ? { ...a, status: 'pending' as ApprovalStatus } : a
      )
    );
  };

  const FILTERS: { id: ApprovalStatus | 'all'; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: approvals.length },
    { id: 'pending', label: 'Pending', count: approvals.filter((a) => a.status === 'pending').length },
    { id: 'approved', label: 'Approved', count: approvals.filter((a) => a.status === 'approved').length },
    { id: 'rejected', label: 'Rejected', count: approvals.filter((a) => a.status === 'rejected').length },
  ];

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => window.history.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <ShieldAlert className="h-3.5 w-3.5 text-purple-400" />
            Approvals
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            {task?.title || 'Approval History'}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review and manage approval requests for this task.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <p className="text-2xl font-black text-yellow-400">{summary.pending}</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Pending</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <p className="text-2xl font-black text-emerald-400">{summary.approved}</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Approved</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <p className="text-2xl font-black text-red-400">{summary.rejected}</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Rejected</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <p className="text-2xl font-black text-indigo-400">{isNaN(summary.rate) ? 0 : summary.rate}%</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Approval Rate</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              filter === f.id
                ? 'bg-purple-500/10 text-purple-400'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {f.label}
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
              filter === f.id ? 'bg-purple-500/20 text-purple-300' : 'bg-white/[0.04] text-zinc-600',
            )}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Approval list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20 py-20 text-center">
            <ShieldCheck className="mb-4 h-10 w-10 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-500">No approval entries found</p>
          </div>
        ) : (
          filtered.map((entry, i) => {
            const riskCfg = RISK_CONFIG[entry.riskLevel];
            const statusCfg = STATUS_CONFIG[entry.status];
            const RiskIcon = riskCfg.icon;
            const StatusIcon = statusCfg.icon;
            const isPending = entry.status === 'pending' || entry.status === 'expired';

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  'rounded-2xl border p-5 transition-all',
                  isPending
                    ? 'border-yellow-500/20 bg-yellow-500/[0.02]'
                    : 'border-white/[0.07] bg-black/30',
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Risk icon */}
                  <div className={cn(
                    'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border',
                    riskCfg.bg, riskCfg.border,
                  )}>
                    <RiskIcon className={cn('h-5 w-5', riskCfg.color)} />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {entry.description}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={cn(
                            'rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                            riskCfg.bg, riskCfg.border, riskCfg.color,
                          )}>
                            {riskCfg.label}
                          </span>
                          <span className={cn(
                            'rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                            statusCfg.bg, statusCfg.color,
                          )}>
                            <StatusIcon className="mr-1 inline h-2.5 w-2.5" />
                            {statusCfg.label}
                          </span>
                        </div>
                      </div>

                      {isPending && (
                        <button
                          onClick={(e) => handleResubmit(e, entry.id)}
                          className="flex items-center gap-1.5 rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-1.5 text-[10px] font-semibold text-purple-400 transition-all hover:bg-purple-500/20"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Resubmit
                        </button>
                      )}
                    </div>

                    {/* Details */}
                    <div className="rounded-xl bg-white/[0.02] p-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="font-medium text-zinc-500 w-14">Action:</span>
                        <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-zinc-400 uppercase">
                          {entry.action}
                        </code>
                      </div>
                      {entry.target && (
                        <div className="flex items-start gap-2 text-[10px]">
                          <span className="font-medium text-zinc-500 w-14 flex-shrink-0">Target:</span>
                          <code className="break-all font-mono text-zinc-400">{entry.target}</code>
                        </div>
                      )}
                      {entry.stepIndex !== undefined && (
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="font-medium text-zinc-500 w-14">Step:</span>
                          <span className="font-mono text-zinc-500">#{entry.stepIndex}</span>
                        </div>
                      )}
                    </div>

                    {/* Timestamps */}
                    <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {timeAgo(entry.createdAt)}
                      </span>
                      {entry.resolvedAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Resolved {timeAgo(entry.resolvedAt)}
                        </span>
                      )}
                      {entry.resolvedBy && (
                        <span>by {entry.resolvedBy}</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
