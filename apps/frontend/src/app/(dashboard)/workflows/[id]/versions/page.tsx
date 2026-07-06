'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Archive,
  FileClock,
  Eye,
  GitCompareArrows,
  Clock,
  Layers,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';

interface WorkflowVersion {
  id: string;
  version: number;
  createdAt: string;
  changeSummary: string;
  stepCount: number;
  status: 'active' | 'draft' | 'archived' | 'deleted';
  createdBy: string;
  runCount: number;
  successRate: number;
}

const MOCK_VERSIONS: WorkflowVersion[] = [
  {
    id: 'v-5',
    version: 5,
    createdAt: '2026-07-01T14:30:00Z',
    changeSummary: 'Refactored extract step to handle dynamic content loading with improved selectors',
    stepCount: 5,
    status: 'draft',
    createdBy: 'you',
    runCount: 0,
    successRate: 0,
  },
  {
    id: 'v-4',
    version: 4,
    createdAt: '2026-07-01T09:00:00Z',
    changeSummary: 'Added screenshot step for visual verification and fixed navigation timeout issue',
    stepCount: 4,
    status: 'active',
    createdBy: 'you',
    runCount: 3,
    successRate: 100,
  },
  {
    id: 'v-3',
    version: 3,
    createdAt: '2026-06-25T16:30:00Z',
    changeSummary: 'Updated wait times for slower page loads and added retry logic on failed assertions',
    stepCount: 3,
    status: 'archived',
    createdBy: 'alice@team.com',
    runCount: 18,
    successRate: 94,
  },
  {
    id: 'v-2',
    version: 2,
    createdAt: '2026-06-20T14:30:00Z',
    changeSummary: 'Updated CSS selectors to match new site layout redesign',
    stepCount: 3,
    status: 'archived',
    createdBy: 'alice@team.com',
    runCount: 25,
    successRate: 88,
  },
  {
    id: 'v-1',
    version: 1,
    createdAt: '2026-05-15T08:00:00Z',
    changeSummary: 'Initial workflow created with basic navigation and data extraction steps',
    stepCount: 3,
    status: 'deleted',
    createdBy: 'bob@team.com',
    runCount: 42,
    successRate: 82,
  },
];

const VERSION_COMPARE_DATA = [
  { step: 'Navigate to products', v1: '3.2s', v2: '2.8s', v3: '2.5s' },
  { step: 'Extract prices', v1: '1.8s', v2: '1.5s', v3: '1.2s' },
  { step: 'Extract names', v1: '1.5s', v2: '1.3s', v3: '1.1s' },
  { step: 'Assert products loaded', v1: '0.8s', v2: '0.6s', v3: '0.5s' },
  { step: 'Screenshot capture', v1: '\u2014', v2: '\u2014', v3: '2.1s' },
];

function StatusBadge({ status }: { status: WorkflowVersion['status'] }) {
  const config = {
    active: { label: 'Active', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' },
    draft: { label: 'Draft', className: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400' },
    archived: { label: 'Archived', className: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400' },
    deleted: { label: 'Deleted', className: 'border-red-500/20 bg-red-500/10 text-red-400' },
  };
  const c = config[status];
  const Icon = status === 'active' ? CheckCircle2 : status === 'draft' ? FileClock : status === 'archived' ? Archive : Trash2;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold', c.className)}>
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

export default function WorkflowVersionsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [compareMode, setCompareMode] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions((prev) =>
      prev.includes(versionId)
        ? prev.filter((v) => v !== versionId)
        : prev.length < 2
          ? [...prev, versionId]
          : [prev[1], versionId],
    );
  };

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    await new Promise((r) => setTimeout(r, 1200));
    setRestoring(null);
  };

  const handleRollback = async (versionId: string) => {
    setRollingBack(versionId);
    await new Promise((r) => setTimeout(r, 1500));
    setRollingBack(null);
  };

  const compareVersions = selectedVersions.map((vid) => MOCK_VERSIONS.find((v) => v.id === vid)!).filter(Boolean);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/workflows/${id}`)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-black/30 text-zinc-500 hover:text-white transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Version History</h1>
            <p className="mt-1 text-sm text-zinc-500">Track, compare, and restore workflow versions</p>
          </div>
        </div>

        <button
          onClick={() => {
            setCompareMode(!compareMode);
            setSelectedVersions([]);
          }}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-all',
            compareMode
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.06]',
          )}
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
          {compareMode ? 'Exit Compare' : 'Compare Versions'}
        </button>
      </div>

      {/* Version Timeline */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={compareMode ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <div className="space-y-3">
            {MOCK_VERSIONS.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  'relative overflow-hidden rounded-[24px] border p-5 backdrop-blur-xl transition-all',
                  v.status === 'deleted'
                    ? 'border-red-500/10 bg-red-500/[0.03] opacity-70'
                    : 'border-white/[0.07] bg-black/30',
                  compareMode && selectedVersions.includes(v.id) && 'border-red-500/30 ring-1 ring-red-500/20',
                  compareMode && 'cursor-pointer hover:border-white/15',
                )}
                onClick={() => compareMode && toggleVersionSelection(v.id)}
              >
                <div className="flex items-start gap-4">
                  {/* Timeline dot */}
                  <div className="relative flex flex-col items-center pt-1">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold',
                        v.status === 'active'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : v.status === 'deleted'
                            ? 'border-red-500/30 bg-red-500/10 text-red-400'
                            : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
                      )}
                    >
                      v{v.version}
                    </div>
                    {i < MOCK_VERSIONS.length - 1 && (
                      <div className="mt-1 h-full w-px bg-white/[0.07]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">Version {v.version}</h3>
                          <StatusBadge status={v.status} />
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{v.changeSummary}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {v.status === 'deleted' ? (
                          <button
                            onClick={() => handleRestore(v.id)}
                            disabled={restoring === v.id}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all disabled:opacity-50"
                          >
                            {restoring === v.id ? (
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" /></svg>
                            ) : (
                              <><RotateCcw className="h-3 w-3" /> Restore</>
                            )}
                          </button>
                        ) : v.status !== 'active' ? (
                          <button
                            onClick={() => handleRollback(v.id)}
                            disabled={rollingBack === v.id}
                            className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-red-400 transition-all disabled:opacity-50 shadow-lg shadow-red-500/20"
                          >
                            {rollingBack === v.id ? (
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" /></svg>
                            ) : (
                              <><RotateCcw className="h-3 w-3" /> Rollback</>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => router.push(`/workflows/${id}/edit`)}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
                          >
                            <Eye className="h-3 w-3" /> View
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(v.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {v.stepCount} steps
                      </span>
                      <span>{v.runCount} runs</span>
                      {v.successRate > 0 && (
                        <span className={cn('font-semibold', v.successRate >= 90 ? 'text-emerald-400' : 'text-yellow-400')}>
                          {v.successRate}% success
                        </span>
                      )}
                      <span className="text-zinc-700">by {v.createdBy}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Compare Panel */}
        <AnimatePresence>
          {compareMode && compareVersions.length === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl h-fit sticky top-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <GitCompareArrows className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-white">Side by Side</h2>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {compareVersions.map((v) => (
                    <div key={v.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 text-center">
                      <p className="text-xs font-bold text-white">v{v.version}</p>
                      <StatusBadge status={v.status} />
                    </div>
                  ))}
                </div>

                <div className="h-px bg-white/[0.07]" />

                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Metrics</p>
                  {compareVersions.map((v) => (
                    <div key={v.id} className="space-y-1.5">
                      <p className="text-[10px] text-zinc-400">v{v.version}</p>
                      <div className="grid grid-cols-2 gap-1">
                        <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                          <p className="text-[9px] text-zinc-500">Runs</p>
                          <p className="text-xs font-semibold text-white">{v.runCount}</p>
                        </div>
                        <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                          <p className="text-[9px] text-zinc-500">Success</p>
                          <p className={cn('text-xs font-semibold', v.successRate >= 90 ? 'text-emerald-400' : 'text-yellow-400')}>
                            {v.successRate}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-white/[0.07]" />

                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Step Durations</p>
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_60px_60px] gap-2 text-[9px] text-zinc-600 font-semibold uppercase tracking-wider px-1">
                      <span>Step</span>
                      {compareVersions.map((v) => (
                        <span key={v.id} className="text-center">v{v.version}</span>
                      ))}
                    </div>
                    {VERSION_COMPARE_DATA.slice(0, 3).map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_60px] gap-2 rounded-lg bg-white/[0.02] px-2 py-1.5 text-[10px]">
                        <span className="text-zinc-400 truncate">{row.step}</span>
                        {compareVersions.map((v, _j) => {
                          const key = `v${v.version}` as keyof typeof row;
                          return (
                            <span key={v.id} className="text-center font-mono text-white">
                              {row[key] as string}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleRollback(compareVersions[0].id)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-400 transition-all shadow-lg shadow-red-500/20"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Rollback to v{compareVersions[0].version}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Select versions hint */}
      {compareMode && selectedVersions.length < 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-[24px] border border-dashed border-white/[0.07] bg-black/20 py-8 text-center"
        >
          <GitCompareArrows className="mx-auto h-5 w-5 text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-500">Select two versions to compare</p>
          <p className="text-xs text-zinc-600 mt-1">Click on any two version cards above</p>
        </motion.div>
      )}
    </div>
  );
}
