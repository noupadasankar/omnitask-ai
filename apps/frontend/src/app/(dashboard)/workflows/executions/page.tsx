'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Filter,
  Search,
  RotateCcw,
  Eye,
  X,
  Play,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  PauseCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { formatDate, formatDuration, timeAgo } from '@/lib/utils';

type ExecutionStatus = 'running' | 'completed' | 'failed' | 'queued' | 'paused';
type TriggerType = 'manual' | 'scheduled' | 'event';

interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  trigger: TriggerType;
  startedAt: string;
  completedAt: string | null;
  duration: number;
  error: string | null;
  stepsCompleted: number;
  stepsTotal: number;
}

const MOCK_EXECUTIONS: Execution[] = [
  { id: 'exec-001', workflowId: 'w-1', workflowName: 'Daily Price Monitor', status: 'completed', trigger: 'scheduled', startedAt: '2026-07-01T09:00:00Z', completedAt: '2026-07-01T09:02:34Z', duration: 154000, error: null, stepsCompleted: 5, stepsTotal: 5 },
  { id: 'exec-002', workflowId: 'w-2', workflowName: 'Competitor Scraper', status: 'failed', trigger: 'scheduled', startedAt: '2026-07-01T08:00:00Z', completedAt: '2026-07-01T08:01:12Z', duration: 72000, error: 'Navigation timeout: page did not load within 30s', stepsCompleted: 2, stepsTotal: 6 },
  { id: 'exec-003', workflowId: 'w-1', workflowName: 'Daily Price Monitor', status: 'completed', trigger: 'scheduled', startedAt: '2026-06-30T09:00:00Z', completedAt: '2026-06-30T09:03:01Z', duration: 181000, error: null, stepsCompleted: 5, stepsTotal: 5 },
  { id: 'exec-004', workflowId: 'w-3', workflowName: 'Form Filler QA', status: 'running', trigger: 'manual', startedAt: '2026-07-01T10:15:00Z', completedAt: null, duration: 45000, error: null, stepsCompleted: 3, stepsTotal: 6 },
  { id: 'exec-005', workflowId: 'w-4', workflowName: 'LinkedIn Profile Scraper', status: 'queued', trigger: 'event', startedAt: '2026-07-01T10:30:00Z', completedAt: null, duration: 0, error: null, stepsCompleted: 0, stepsTotal: 5 },
  { id: 'exec-006', workflowId: 'w-1', workflowName: 'Daily Price Monitor', status: 'completed', trigger: 'scheduled', startedAt: '2026-06-29T09:00:00Z', completedAt: '2026-06-29T09:02:45Z', duration: 165000, error: null, stepsCompleted: 5, stepsTotal: 5 },
  { id: 'exec-007', workflowId: 'w-2', workflowName: 'Competitor Scraper', status: 'failed', trigger: 'scheduled', startedAt: '2026-06-30T08:00:00Z', completedAt: '2026-06-30T08:00:55Z', duration: 55000, error: 'Element not found: .price-tag selector matched 0 elements', stepsCompleted: 3, stepsTotal: 6 },
  { id: 'exec-008', workflowId: 'w-5', workflowName: 'Uptime Monitor', status: 'paused', trigger: 'scheduled', startedAt: '2026-06-28T12:00:00Z', completedAt: '2026-06-28T12:00:30Z', duration: 30000, error: null, stepsCompleted: 2, stepsTotal: 4 },
  { id: 'exec-009', workflowId: 'w-3', workflowName: 'Form Filler QA', status: 'completed', trigger: 'manual', startedAt: '2026-06-29T14:00:00Z', completedAt: '2026-06-29T14:04:20Z', duration: 260000, error: null, stepsCompleted: 6, stepsTotal: 6 },
  { id: 'exec-010', workflowId: 'w-6', workflowName: 'Twitter Trend Monitor', status: 'completed', trigger: 'scheduled', startedAt: '2026-06-30T06:00:00Z', completedAt: '2026-06-30T06:05:10Z', duration: 310000, error: null, stepsCompleted: 4, stepsTotal: 4 },
  { id: 'exec-011', workflowId: 'w-6', workflowName: 'Twitter Trend Monitor', status: 'failed', trigger: 'scheduled', startedAt: '2026-06-29T06:00:00Z', completedAt: '2026-06-29T06:01:05Z', duration: 65000, error: 'Rate limit exceeded: too many requests', stepsCompleted: 1, stepsTotal: 4 },
  { id: 'exec-012', workflowId: 'w-7', workflowName: 'Data Export Job', status: 'completed', trigger: 'event', startedAt: '2026-06-27T16:30:00Z', completedAt: '2026-06-27T16:32:15Z', duration: 135000, error: null, stepsCompleted: 3, stepsTotal: 3 },
];

const STATUS_OPTIONS: { value: ExecutionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'failed', label: 'Failed' },
  { value: 'queued', label: 'Queued' },
  { value: 'paused', label: 'Paused' },
];

function StatusBadge({ status }: { status: ExecutionStatus }) {
  const config = {
    running: { icon: Loader2, label: 'Running', className: 'text-blue-400 border-blue-500/20 bg-blue-500/10' },
    completed: { icon: CheckCircle2, label: 'Completed', className: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' },
    failed: { icon: XCircle, label: 'Failed', className: 'text-red-400 border-red-500/20 bg-red-500/10' },
    queued: { icon: Clock, label: 'Queued', className: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10' },
    paused: { icon: PauseCircle, label: 'Paused', className: 'text-orange-400 border-orange-500/20 bg-orange-500/10' },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold', c.className)}>
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {c.label}
    </span>
  );
}

function TriggerBadge({ trigger }: { trigger: TriggerType }) {
  const config = {
    manual: { icon: Play, label: 'Manual' },
    scheduled: { icon: Calendar, label: 'Scheduled' },
    event: { icon: AlertTriangle, label: 'Event' },
  };
  const c = config[trigger];
  const Icon = c.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

export default function ExecutionsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all');
  const [detail, setDetail] = useState<Execution | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return MOCK_EXECUTIONS.filter((exec) => {
      const matchesSearch =
        exec.workflowName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exec.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || exec.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, statusFilter]);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    await new Promise((r) => setTimeout(r, 1500));
    setRetrying(null);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-black/30 text-zinc-500 hover:text-white transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Workflow Executions</h1>
          <p className="mt-1 text-sm text-zinc-500">Monitor and manage all workflow runs</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by workflow name or ID..."
            className="w-full h-10 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:bg-white/[0.04] focus:outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | 'all')}
              className="h-10 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-8 text-sm text-zinc-400 focus:border-red-500/30 focus:outline-none appearance-none cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          { label: 'Total Runs', value: MOCK_EXECUTIONS.length, color: 'text-white' },
          { label: 'Completed', value: MOCK_EXECUTIONS.filter((e) => e.status === 'completed').length, color: 'text-emerald-400' },
          { label: 'Failed', value: MOCK_EXECUTIONS.filter((e) => e.status === 'failed').length, color: 'text-red-400' },
          { label: 'Running', value: MOCK_EXECUTIONS.filter((e) => e.status === 'running').length, color: 'text-blue-400' },
        ] as const).map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl"
          >
            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{stat.label}</p>
            <p className={cn('mt-1 text-2xl font-black', stat.color)}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-16 text-center">
          <Filter className="h-6 w-6 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-400">No executions found</p>
          <p className="mt-1 text-xs text-zinc-600">Try adjusting your filters</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-[24px] border border-white/[0.07] bg-black/30 backdrop-blur-xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {['Workflow', 'Status', 'Trigger', 'Started', 'Duration', 'Steps', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((exec, i) => (
                  <motion.tr
                    key={exec.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className="border-b border-white/[0.05] last:border-0 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">{exec.workflowName}</p>
                        <p className="text-[10px] font-mono text-zinc-600">{exec.id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={exec.status} />
                    </td>
                    <td className="px-4 py-3">
                      <TriggerBadge trigger={exec.trigger} />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs text-white">{formatDate(exec.startedAt)}</p>
                        <p className="text-[10px] text-zinc-600">{timeAgo(exec.startedAt)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-white font-mono">{formatDuration(exec.duration)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              exec.status === 'failed' ? 'bg-red-500' : exec.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500',
                            )}
                            style={{ width: `${(exec.stepsCompleted / exec.stepsTotal) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {exec.stepsCompleted}/{exec.stepsTotal}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDetail(exec)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all"
                          title="View details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {exec.status === 'failed' && (
                          <button
                            onClick={() => handleRetry(exec.id)}
                            disabled={retrying === exec.id}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                            title="Retry execution"
                          >
                            <RotateCcw className={cn('h-3.5 w-3.5', retrying === exec.id && 'animate-spin')} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[24px] border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            >
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{detail.workflowName}</h2>
                  <p className="text-xs font-mono text-zinc-500">{detail.id}</p>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-500">Status</span>
                  <StatusBadge status={detail.status} />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-500">Trigger</span>
                  <TriggerBadge trigger={detail.trigger} />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-500">Started</span>
                  <span className="text-xs text-white">{formatDate(detail.startedAt)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-500">Duration</span>
                  <span className="text-xs text-white font-mono">{formatDuration(detail.duration)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-500">Steps</span>
                  <span className="text-xs text-white">{detail.stepsCompleted}/{detail.stepsTotal}</span>
                </div>
                {detail.error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Error</p>
                    <p className="mt-0.5 text-xs text-red-300">{detail.error}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDetail(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/[0.05]"
                >
                  Close
                </button>
                {detail.status === 'failed' && (
                  <button
                    onClick={() => {
                      setDetail(null);
                      handleRetry(detail.id);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 shadow-lg shadow-red-500/20"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry Execution
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
