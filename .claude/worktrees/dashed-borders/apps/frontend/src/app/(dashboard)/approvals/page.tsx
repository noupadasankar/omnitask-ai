'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Eye,
  ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/* ===========================================================
   MOCK APPROVAL DATA
=========================================================== */

const APPROVALS = [
  {
    id: 'apr-001',
    taskId: 'task-abc123',
    title: 'Delete 24,000 records from production database',
    description: 'Batch cleanup of archived records older than 2 years. Estimated 3.2GB freed.',
    risk: 'critical',
    riskScore: 92,
    requestedBy: 'BrowserAgent',
    requestedAt: '2026-05-28T14:02:11Z',
    status: 'pending',
    approver: null,
  },
  {
    id: 'apr-002',
    taskId: 'task-def456',
    title: 'Send 500 promotional emails to subscribers',
    description: 'Automated newsletter blast to 500 verified subscribers.',
    risk: 'low',
    riskScore: 12,
    requestedBy: 'PlannerAgent',
    requestedAt: '2026-05-28T13:45:00Z',
    status: 'pending',
    approver: null,
  },
  {
    id: 'apr-003',
    taskId: 'task-ghi789',
    title: 'Execute shell script on production servers',
    description: 'Run npm install and database migration scripts.',
    risk: 'high',
    riskScore: 78,
    requestedBy: 'ExecutionCore',
    requestedAt: '2026-05-28T12:30:00Z',
    status: 'approved',
    approver: 'Admin',
    approvedAt: '2026-05-28T12:35:00Z',
  },
  {
    id: 'apr-004',
    taskId: 'task-jkl012',
    title: 'Modify pricing for 8 product SKUs',
    description: 'Bulk price update triggered by competitor monitoring.',
    risk: 'medium',
    riskScore: 45,
    requestedBy: 'BrowserAgent',
    requestedAt: '2026-05-28T11:00:00Z',
    status: 'rejected',
    approver: 'Admin',
    rejectedAt: '2026-05-28T11:15:00Z',
  },
];

const RISK_COLORS = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  high: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500' },
  medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  low: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

/* ===========================================================
   COMPONENT
=========================================================== */

export default function ApprovalsPage() {
  const [activeFilter, setActiveFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);

  const pendingCount = APPROVALS.filter((a) => a.status === 'pending').length;
  const approvedCount = APPROVALS.filter((a) => a.status === 'approved').length;
  const rejectedCount = APPROVALS.filter((a) => a.status === 'rejected').length;

  const filteredApprovals = APPROVALS.filter((a) => a.status === activeFilter);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Approval Center
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review and approve autonomous agent actions
          </p>
        </div>

        <button className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Queue
        </button>
      </div>

      {/* ================================================= */}
      {/* STATS BANNER                                      */}
      {/* ================================================= */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-4">
          <StatPill
            icon={Clock}
            label="Pending"
            value={pendingCount}
            color="text-yellow-400"
            variant="pending"
          />
          <StatPill
            icon={CheckCircle2}
            label="Approved"
            value={approvedCount}
            color="text-emerald-400"
            variant="approved"
          />
          <StatPill
            icon={XCircle}
            label="Rejected"
            value={rejectedCount}
            color="text-red-400"
            variant="rejected"
          />
        </div>
      </div>

      {/* ================================================= */}
      {/* FILTER TABS                                       */}
      {/* ================================================= */}
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
        {(['pending', 'approved', 'rejected'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={cn(
              'flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all capitalize',
              activeFilter === filter
                ? 'bg-red-500/10 text-red-400'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {filter}
            <span className="ml-2 text-xs opacity-60">
              ({APPROVALS.filter((a) => a.status === filter).length})
            </span>
          </button>
        ))}
      </div>

      {/* ================================================= */}
      {/* APPROVAL LIST                                     */}
      {/* ================================================= */}
      <div className="space-y-3">
        {filteredApprovals.map((approval, i) => {
          const risk = RISK_COLORS[approval.risk as keyof typeof RISK_COLORS];
          const isActive = approval.status === 'pending';

          return (
            <motion.div
              key={approval.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setSelectedApproval(approval.id)}
              className={cn(
                'group relative cursor-pointer overflow-hidden rounded-[24px] border bg-black/30 p-5 backdrop-blur-xl transition-all duration-300',
                selectedApproval === approval.id
                  ? 'border-red-500/30 shadow-lg shadow-red-500/10'
                  : 'border-white/[0.07] hover:border-white/15',
              )}
            >
              {/* Top bar - risk indicator */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('h-2 w-2 rounded-full', risk.dot)} />

                  <span className={cn('text-[11px] font-semibold uppercase tracking-wider', risk.text)}>
                    {approval.risk} Risk
                  </span>

                  <span className="text-[10px] text-zinc-700 ml-2">
                    Score: {approval.riskScore}/100
                  </span>
                </div>

                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                    approval.status === 'pending'
                      ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
                      : approval.status === 'approved'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border-red-500/20 bg-red-500/10 text-red-400',
                  )}
                >
                  {approval.status}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-[14px] font-semibold text-white">
                {approval.title}
              </h3>

              {/* Description */}
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                {approval.description}
              </p>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-4">
                <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                  <span className="flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    {approval.requestedBy}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(approval.requestedAt).toLocaleString()}
                  </span>
                </div>

                {isActive && (
                  <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // approve action
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Approve
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // reject action
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ===========================================================
   SUB-COMPONENTS
=========================================================== */

function StatPill({
  icon: Icon,
  label,
  value,
  color,
  variant,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
  variant: 'pending' | 'approved' | 'rejected';
}) {
  const configs = {
    pending: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400' },
    approved: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    rejected: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  };

  const config = configs[variant];

  return (
    <div className={cn('flex items-center justify-between rounded-xl border px-4 py-3', config.bg, config.border)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color)} />
        <span className={cn('text-[11px] font-medium', color)}>{label}</span>
      </div>
      <span className={cn('text-lg font-bold text-white', color)}>
        {value}
      </span>
    </div>
  );
}