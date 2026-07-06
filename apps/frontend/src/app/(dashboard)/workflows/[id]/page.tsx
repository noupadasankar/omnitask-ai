'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Play,
  Pause,
  Clock,
  CalendarClock,
  Workflow,
  CheckCircle2,
  XCircle,
  Loader2,
  History,
  ExternalLink,
  Settings2,
  Activity,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate, formatDuration, timeAgo } from '@/lib/utils';

type WorkflowStatus = 'active' | 'paused' | 'draft' | 'error';
type TriggerType = 'manual' | 'scheduled' | 'event';

interface WorkflowStep {
  id: string;
  action: string;
  targetUrl: string;
  selector: string;
  description: string;
}

interface ExecutionSummary {
  id: string;
  status: string;
  startedAt: string;
  duration: number;
  trigger: string;
}

const MOCK_WORKFLOW = {
  id: 'w-1',
  name: 'Daily Price Monitor',
  description: 'Monitors competitor pricing for top 10 products and alerts when price drops exceed 10%. Runs every morning at 9 AM.',
  status: 'active' as WorkflowStatus,
  triggerType: 'scheduled' as TriggerType,
  cronExpression: '0 9 * * *',
  createdAt: '2026-05-15T08:00:00Z',
  lastRunAt: '2026-07-01T09:02:34Z',
  lastRunStatus: 'completed',
  totalRuns: 47,
  successRate: 91.5,
  steps: [
    { id: 's-1', action: 'Navigate', targetUrl: 'https://competitor.com/products', selector: '', description: 'Navigate to competitor product listing page' },
    { id: 's-2', action: 'Extract', targetUrl: 'https://competitor.com/products', selector: '.product-card .price', description: 'Extract product prices from listing' },
    { id: 's-3', action: 'Extract', targetUrl: 'https://competitor.com/products', selector: '.product-card .name', description: 'Extract product names' },
    { id: 's-4', action: 'Assert', targetUrl: 'https://competitor.com/products', selector: '.product-card', description: 'Verify at least 10 products are loaded' },
    { id: 's-5', action: 'Screenshot', targetUrl: 'https://competitor.com/products', selector: '', description: 'Capture screenshot for verification' },
  ],
  recentExecutions: [
    { id: 'exec-001', status: 'completed', startedAt: '2026-07-01T09:00:00Z', duration: 154000, trigger: 'scheduled' },
    { id: 'exec-003', status: 'completed', startedAt: '2026-06-30T09:00:00Z', duration: 181000, trigger: 'scheduled' },
    { id: 'exec-006', status: 'completed', startedAt: '2026-06-29T09:00:00Z', duration: 165000, trigger: 'scheduled' },
    { id: 'exec-013', status: 'failed', startedAt: '2026-06-28T09:00:00Z', duration: 45000, trigger: 'scheduled' },
    { id: 'exec-014', status: 'completed', startedAt: '2026-06-27T09:00:00Z', duration: 158000, trigger: 'scheduled' },
  ],
};

const ACTION_ICONS: Record<string, string> = {
  Navigate: '🔗',
  Click: '👆',
  Input: '⌨️',
  Extract: '📋',
  Wait: '⏱️',
  Screenshot: '📸',
  Scroll: '📜',
  Assert: '✅',
};

function StepCard({ step, index }: { step: WorkflowStep; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-xs font-bold text-red-400">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">{ACTION_ICONS[step.action] || '⚡'}</span>
          <span className="text-xs font-semibold text-white">{step.action}</span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500 truncate">{step.description}</p>
        {step.targetUrl && (
          <p className="mt-0.5 text-[10px] font-mono text-zinc-600 truncate">{step.targetUrl}</p>
        )}
        {step.selector && (
          <p className="text-[10px] font-mono text-zinc-600 truncate">Selector: {step.selector}</p>
        )}
      </div>
    </motion.div>
  );
}

function ExecutionRow({ exec }: { exec: ExecutionSummary }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full',
            exec.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
          )}
        >
          {exec.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        </span>
        <div>
          <p className="text-xs font-medium text-white">{exec.id}</p>
          <p className="text-[10px] text-zinc-500">{timeAgo(exec.startedAt)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono text-zinc-500">{formatDuration(exec.duration)}</span>
        <span className="text-[10px] text-zinc-600 capitalize">{exec.trigger}</span>
      </div>
    </div>
  );
}

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const wf = MOCK_WORKFLOW;

  const handleDelete = async () => {
    setDeleting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setDeleting(false);
    router.push('/workflows');
  };

  const handleToggleStatus = async () => {
    setTogglingStatus(true);
    await new Promise((r) => setTimeout(r, 800));
    setTogglingStatus(false);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/workflows')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-black/30 text-zinc-500 hover:text-white transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">{wf.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">{wf.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push(`/workflows/${id}/edit`)}
            className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleToggleStatus}
            disabled={togglingStatus}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all',
              wf.status === 'active'
                ? 'border border-orange-500/20 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20',
            )}
          >
            {togglingStatus ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : wf.status === 'active' ? (
              <><Pause className="h-3.5 w-3.5" /> Pause</>
            ) : (
              <><Play className="h-3.5 w-3.5" /> Activate</>
            )}
          </motion.button>

          <div className="relative">
            <button
              onClick={() => setConfirmDelete(!confirmDelete)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-black/30 text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-all"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {confirmDelete && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="absolute right-0 top-full mt-2 z-10 w-64 rounded-[20px] border border-white/10 bg-zinc-950 p-4 shadow-2xl"
              >
                <p className="text-xs font-medium text-white mb-3">Delete this workflow?</p>
                <p className="text-[10px] text-zinc-500 mb-4">This action cannot be undone. All execution history will be preserved.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.05]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-red-400 disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Delete
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold',
            wf.status === 'active'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : wf.status === 'paused'
                ? 'border-orange-500/20 bg-orange-500/10 text-orange-400'
                : wf.status === 'draft'
                  ? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'
                  : 'border-red-500/20 bg-red-500/10 text-red-400',
          )}
        >
          <Activity className="h-3 w-3" />
          {wf.status.toUpperCase()}
        </span>
        <span className="text-[11px] text-zinc-500">
          Created {formatDate(wf.createdAt)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Steps */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-3"
          >
            {([
              { label: 'Total Runs', value: wf.totalRuns, icon: History, color: 'text-blue-400' },
              { label: 'Success Rate', value: `${wf.successRate}%`, icon: CheckCircle2, color: 'text-emerald-400' },
              { label: 'Last Run', value: timeAgo(wf.lastRunAt), icon: Clock, color: 'text-zinc-400' },
            ] as const).map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="rounded-[24px] border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', stat.color)} />
                    <span className="text-[10px] font-medium text-zinc-500">{stat.label}</span>
                  </div>
                  <p className={cn('mt-1.5 text-xl font-bold', stat.color)}>{stat.value}</p>
                </div>
              );
            })}
          </motion.div>

          {/* Steps */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-white">Workflow Steps</h2>
                <span className="text-[10px] text-zinc-600">({wf.steps.length})</span>
              </div>
            </div>
            <div className="space-y-2">
              {wf.steps.map((step, i) => (
                <StepCard key={step.id} step={step} index={i} />
              ))}
            </div>
          </motion.div>

          {/* Execution History */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-white">Recent Executions</h2>
              </div>
              <button
                onClick={() => router.push('/workflows/executions')}
                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-all"
              >
                View all
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-2">
              {wf.recentExecutions.map((exec) => (
                <ExecutionRow key={exec.id} exec={exec} />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-6">
          {/* Schedule Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl space-y-4"
          >
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Schedule</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-zinc-500">Trigger Type</span>
                <span className="text-xs capitalize text-white font-medium">{wf.triggerType}</span>
              </div>
              {wf.triggerType === 'scheduled' && (
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-500">Cron</span>
                  <span className="text-xs font-mono text-white">{wf.cronExpression}</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-zinc-500">Next Run</span>
                <span className="text-xs text-white">{wf.status === 'active' ? 'Jul 2, 2026, 9:00 AM' : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-zinc-500">Last Run</span>
                <span className="text-xs text-white">{timeAgo(wf.lastRunAt)}</span>
              </div>
            </div>

            <div className="h-px bg-white/[0.07]" />

            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Success Rate</span>
              <span className="font-semibold text-emerald-400">{wf.successRate}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${wf.successRate}%` }}
              />
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl space-y-3"
          >
            <h2 className="text-sm font-semibold text-white">Quick Actions</h2>
            <button
              onClick={() => router.push(`/workflows/${id}/edit`)}
              className="w-full flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Edit Workflow
            </button>
            <button
              onClick={() => router.push(`/workflows/${id}/analytics`)}
              className="w-full flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <Activity className="h-3.5 w-3.5" />
              View Analytics
            </button>
            <button
              onClick={() => router.push(`/workflows/${id}/versions`)}
              className="w-full flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <History className="h-3.5 w-3.5" />
              Version History
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
