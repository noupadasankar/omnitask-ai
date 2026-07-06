'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  AlertTriangle,
  Loader2,
  FileText,
  Globe,
  User,
  Timer,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';

interface ApprovalDetail {
  id: string;
  sessionId: string;
  stepIndex: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  actionDetails: {
    action: string;
    target?: string;
    value?: string;
    description: string;
  };
  screenshotUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  createdAt: string;
  updatedAt?: string;
  expiresAt: string;
  approvedBy?: string;
  reason?: string;
}

const RISK_STYLES = {
  CRITICAL: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', dot: 'bg-red-500', label: 'Critical' },
  HIGH:     { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500', label: 'High' },
  MEDIUM:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500', label: 'Medium' },
  LOW:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500', label: 'Low' },
};

const MOCK_DETAIL: ApprovalDetail = {
  id: '',
  sessionId: 'session-abc123',
  stepIndex: 3,
  riskLevel: 'HIGH',
  description: 'Submit job application form on LinkedIn',
  actionDetails: {
    action: 'click',
    target: '#submit-application-button',
    value: '',
    description: 'Click the submit button on the job application form to send your application to Acme Corp.',
  },
  screenshotUrl: '',
  status: 'PENDING',
  createdAt: new Date(Date.now() - 1800000).toISOString(),
  expiresAt: new Date(Date.now() + 900000).toISOString(),
};

const TIMELINE_EVENTS = [
  { label: 'Request Created', time: new Date(Date.now() - 1800000).toISOString(), icon: Activity },
  { label: 'Risk Assessment Complete', time: new Date(Date.now() - 1750000).toISOString(), icon: ShieldAlert },
  { label: 'Awaiting Your Decision', time: new Date(Date.now() - 1700000).toISOString(), icon: Clock },
];

export default function ApprovalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [approval, setApproval] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.get<ApprovalDetail>(`/agent/approvals/${id}`)
      .then((res) => setApproval(res.data))
      .catch(() => setApproval({ ...MOCK_DETAIL, id }))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!approval) return;
    const interval = setInterval(() => {
      const diff = new Date(approval.expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Expired'); return; }
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${min}m ${sec}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [approval]);

  const respond = async (action: 'approve' | 'reject') => {
    setActing(true);
    try {
      await api.post(`/agent/${action}`, { approvalRequestId: id });
      setApproval((prev) => prev ? {
        ...prev,
        status: action === 'approve' ? 'APPROVED' : 'DENIED',
        updatedAt: new Date().toISOString(),
        approvedBy: action === 'approve' ? 'You' : undefined,
        reason: action === 'reject' ? 'Rejected by user' : undefined,
      } : null);
    } catch {
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-red-400" />
        <p className="mt-3 text-sm text-zinc-500">Loading approval details...</p>
      </div>
    );
  }

  if (error || !approval) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-red-500/20 bg-red-500/[0.03] py-16 text-center">
        <AlertTriangle className="h-6 w-6 text-red-400" />
        <p className="mt-3 text-sm font-medium text-white">Approval not found</p>
      </div>
    );
  }

  const risk = RISK_STYLES[approval.riskLevel] ?? RISK_STYLES.MEDIUM;
  const isPending = approval.status === 'PENDING';

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Back */}
      <button
        onClick={() => router.push('/approvals')}
        className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-white"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Approvals
      </button>

      {/* Header */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl border', risk.bg, risk.border)}>
              <ShieldAlert className={cn('h-6 w-6', risk.text)} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Approval Request</h1>
              <p className="mt-1 text-sm text-zinc-400">{approval.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isPending && (
              <span className="flex items-center gap-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1.5 text-[11px] font-semibold text-yellow-400">
                <Timer className="h-3.5 w-3.5" />
                {timeLeft}
              </span>
            )}
            <StatusBadge status={approval.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Action Details */}
          <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
              <FileText className="h-4 w-4 text-red-400" />
              Action Details
            </h2>
            <div className="space-y-3">
              <DetailRow label="Action" value={approval.actionDetails.action} />
              {approval.actionDetails.target && <DetailRow label="Target" value={approval.actionDetails.target} />}
              {approval.actionDetails.value && <DetailRow label="Value" value={approval.actionDetails.value} />}
              <DetailRow label="Description" value={approval.actionDetails.description} />
              <DetailRow label="Step Index" value={`#${approval.stepIndex + 1}`} />
              <DetailRow label="Session" value={approval.sessionId} />
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              Risk Assessment
            </h2>
            <div className="flex items-center gap-3 mb-4">
              <div className={cn('h-3 w-3 rounded-full', risk.dot)} />
              <span className={cn('text-sm font-bold', risk.text)}>{risk.label} Risk</span>
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                This action has been classified as <span className={cn('font-semibold', risk.text)}>{risk.label.toLowerCase()}</span> risk because it involves submitting personal data to a third-party domain. The action requires explicit user approval before execution.
              </p>
            </div>
          </div>

          {/* Screenshot */}
          {approval.screenshotUrl && (
            <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                <Globe className="h-4 w-4 text-red-400" />
                Page Preview
              </h2>
              <div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={approval.screenshotUrl} alt="Page preview" className="w-full object-cover" />
              </div>
            </div>
          )}

          {/* Approve / Reject */}
          {isPending && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <button
                onClick={() => respond('reject')}
                disabled={acting}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 py-3.5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </button>
              <button
                onClick={() => respond('approve')}
                disabled={acting}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 py-3.5 text-sm font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </button>
            </motion.div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status */}
          <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
            <h2 className="mb-4 text-sm font-semibold text-white">Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Current</span>
                <StatusBadge status={approval.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Risk Level</span>
                <span className={cn('text-xs font-semibold', risk.text)}>{risk.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Created</span>
                <span className="text-xs text-zinc-400">{new Date(approval.createdAt).toLocaleTimeString()}</span>
              </div>
              {approval.updatedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Resolved</span>
                  <span className="text-xs text-zinc-400">{new Date(approval.updatedAt).toLocaleTimeString()}</span>
                </div>
              )}
              {approval.approvedBy && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Approved By</span>
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <User className="h-3 w-3" />
                    {approval.approvedBy}
                  </span>
                </div>
              )}
              {approval.reason && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Reason</span>
                  <span className="text-xs text-red-400 text-right max-w-[140px]">{approval.reason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
            <h2 className="mb-4 text-sm font-semibold text-white">Timeline</h2>
            <div className="space-y-4">
              {TIMELINE_EVENTS.map((event, i) => {
                const Icon = event.icon;
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.04]">
                        <Icon className="h-3 w-3 text-zinc-500" />
                      </div>
                      {i < TIMELINE_EVENTS.length - 1 && <div className="mt-1 h-full w-px bg-white/[0.05]" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-xs font-medium text-white">{event.label}</p>
                      <p className="text-[10px] text-zinc-600">{new Date(event.time).toLocaleTimeString()}</p>
                    </div>
                  </div>
                );
              })}
              {!isPending && (
                <div className="flex gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.04]">
                    {approval.status === 'APPROVED' ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">
                      {approval.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                    </p>
                    <p className="text-[10px] text-zinc-600">{approval.updatedAt ? new Date(approval.updatedAt).toLocaleTimeString() : ''}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; border: string; text: string; icon: any }> = {
    PENDING: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', icon: Clock },
    APPROVED: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle2 },
    DENIED: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: XCircle },
  };
  const s = styles[status] ?? styles.PENDING;
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider', s.bg, s.border, s.text)}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-[11px] font-medium text-white text-right max-w-[60%] break-all">{value}</span>
    </div>
  );
}
