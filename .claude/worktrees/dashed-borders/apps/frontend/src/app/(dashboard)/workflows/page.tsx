'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Play,
  Trash2,
  Layout,
  GitBranch,
  RefreshCw,
  Filter,
  Loader2,
  AlertTriangle,
  X,
  Clock,
  CalendarClock,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  useSchedules,
  useCreateSchedule,
  useDeleteSchedule,
} from '@/hooks/useRuntimeData';

interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  failCount: number;
  createdAt: string;
}

const TEMPLATES = [
  { id: 'tpl-1', name: 'Hourly Web Scraper', icon: '🕷️', goal: 'Scrape the target website and export new rows', cron: '0 * * * *', complexity: 'easy' },
  { id: 'tpl-2', name: 'Daily Report', icon: '📊', goal: 'Aggregate task metrics and send a summary report', cron: '0 9 * * *', complexity: 'easy' },
  { id: 'tpl-3', name: 'Price Monitor', icon: '💰', goal: 'Check competitor pricing and alert on changes over 10%', cron: '0 */6 * * *', complexity: 'medium' },
  { id: 'tpl-4', name: 'Weekly Digest', icon: '🤖', goal: 'Compile a weekly performance digest and post to Slack', cron: '0 9 * * 1', complexity: 'advanced' },
];

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 0) return new Date(iso).toLocaleString();
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<'workflows' | 'templates'>('workflows');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', cron: '0 9 * * *' });

  const { data, isLoading, isError, refetch, isFetching } = useSchedules();
  const createMutation = useCreateSchedule();
  const deleteMutation = useDeleteSchedule();

  const schedules: Schedule[] = Array.isArray(data) ? data : [];

  const filtered = useMemo(
    () =>
      schedules.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.cronExpression.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [schedules, searchQuery],
  );

  const openCreate = (preset?: { name: string; goal: string; cron: string }) => {
    setForm(preset ?? { name: '', goal: '', cron: '0 9 * * *' });
    setModalOpen(true);
    setActiveTab('workflows');
  };

  const handleCreate = () => {
    if (!form.name.trim() || !form.goal.trim()) return;
    createMutation.mutate(
      { name: form.name.trim(), goal: form.goal.trim(), cronExpression: form.cron.trim() },
      {
        onSuccess: () => {
          setModalOpen(false);
          setForm({ name: '', goal: '', cron: '0 9 * * *' });
        },
      },
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete workflow "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Workflow Engine</h1>
          <p className="mt-1 text-sm text-zinc-500">Schedule, deploy, and monitor autonomous AI workflows</p>
        </div>

        <button
          onClick={() => openCreate()}
          className="flex h-10 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white hover:bg-red-400 transition-all shadow-lg shadow-red-500/20"
        >
          <Plus className="h-4 w-4" />
          New Workflow
        </button>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
        <button
          onClick={() => setActiveTab('workflows')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
            activeTab === 'workflows' ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          <Layout className="h-4 w-4" />
          My Workflows
          <span className="text-xs opacity-60">({schedules.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
            activeTab === 'templates' ? 'bg-red-500/10 text-red-400' : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          <GitBranch className="h-4 w-4" />
          Templates
        </button>
      </div>

      {/* SEARCH + REFRESH */}
      {activeTab === 'workflows' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows..."
              className="w-full h-10 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:bg-white/[0.04] focus:outline-none transition-all"
            />
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      )}

      {/* WORKFLOWS TAB */}
      {activeTab === 'workflows' && (
        <>
          {isLoading && (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-20">
              <Loader2 className="h-6 w-6 animate-spin text-red-400" />
              <p className="mt-3 text-sm text-zinc-500">Loading workflows...</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-red-500/20 bg-red-500/[0.03] py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <p className="mt-3 text-sm font-medium text-white">Could not load workflows</p>
              <p className="mt-1 text-xs text-zinc-500">Ensure the backend is running on http://localhost:4000.</p>
              <button onClick={() => refetch()} className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]">
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-16 text-center">
              <CalendarClock className="h-6 w-6 text-zinc-600" />
              <p className="mt-3 text-sm font-medium text-zinc-400">
                {schedules.length === 0 ? 'No workflows yet' : 'No workflows match your search'}
              </p>
              <p className="mt-1 text-xs text-zinc-600">Create a scheduled workflow or start from a template.</p>
              {schedules.length === 0 && (
                <button onClick={() => openCreate()} className="mt-4 flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400">
                  <Plus className="h-3.5 w-3.5" /> New Workflow
                </button>
              )}
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((wf, i) => (
                <motion.div
                  key={wf.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.06, 0.4) }}
                  className="group relative overflow-hidden rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all duration-300 hover:border-white/15"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        wf.enabled
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
                      )}
                    >
                      {wf.enabled ? 'ACTIVE' : 'PAUSED'}
                    </span>

                    <button
                      onClick={() => handleDelete(wf.id, wf.name)}
                      disabled={deleteMutation.isPending}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                      title="Delete workflow"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mb-3">
                    <h3 className="text-[14px] font-semibold text-white">{wf.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
                      <Clock className="h-3 w-3" />
                      {wf.cronExpression}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-center">
                    <div>
                      <p className="text-[10px] text-zinc-600">Runs</p>
                      <p className="text-sm font-bold text-white">{wf.runCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-600">Failures</p>
                      <p className={cn('text-sm font-bold', wf.failCount > 0 ? 'text-red-400' : 'text-white')}>{wf.failCount}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-3 text-[10px] text-zinc-600">
                    <span>Last: {relativeTime(wf.lastRunAt)}</span>
                    <span>Next: {relativeTime(wf.nextRunAt)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((tpl, i) => (
            <motion.div
              key={tpl.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all duration-300 hover:border-white/15"
            >
              <div className="mb-3 text-3xl">{tpl.icon}</div>
              <h3 className="text-[13px] font-semibold text-white">{tpl.name}</h3>
              <p className="mt-1 text-[11px] text-zinc-500">{tpl.goal}</p>
              <p className="mt-2 font-mono text-[10px] text-zinc-600">{tpl.cron}</p>

              <div className="mt-3">
                <span
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-wider',
                    tpl.complexity === 'easy' ? 'text-emerald-400' : tpl.complexity === 'medium' ? 'text-yellow-400' : 'text-red-400',
                  )}
                >
                  {tpl.complexity}
                </span>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openCreate({ name: tpl.name, goal: tpl.goal, cron: tpl.cron })}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-red-400 transition-all shadow-lg shadow-red-500/20"
              >
                <Plus className="h-3 w-3" />
                Use Template
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}

      {/* CREATE MODAL */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-[24px] border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">New Scheduled Workflow</h2>
                <button onClick={() => setModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 hover:bg-white/[0.06] hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Workflow Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Daily Competitor Price Check"
                    className="w-full h-10 rounded-xl border border-white/[0.07] bg-black px-4 text-sm text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Goal (natural language)</label>
                  <textarea
                    value={form.goal}
                    onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                    placeholder="Describe what the agent should do on each run..."
                    rows={3}
                    className="w-full rounded-xl border border-white/[0.07] bg-black px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Schedule (cron expression)</label>
                  <input
                    type="text"
                    value={form.cron}
                    onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
                    placeholder="0 9 * * *"
                    className="w-full h-10 rounded-xl border border-white/[0.07] bg-black px-4 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-600">Minute · Hour · Day · Month · Weekday. Default = daily at 09:00.</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setModalOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/[0.05]">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !form.name.trim() || !form.goal.trim()}
                  className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Create Workflow
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
