'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Play,
  Zap,
  Link2,
  MousePointerClick,
  Settings2,
  Clock,
  CalendarClock,
  Workflow,
  Bug,
  History,
  CheckCircle2,
  FileClock,
  Loader2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { generateId, formatDate } from '@/lib/utils';

type TriggerType = 'manual' | 'scheduled' | 'event';
type ActionType = 'click' | 'navigate' | 'input' | 'extract' | 'wait' | 'screenshot' | 'scroll' | 'assert';

interface WorkflowStep {
  id: string;
  action: ActionType;
  targetUrl: string;
  selector: string;
  value: string;
  description: string;
}

interface VersionRecord {
  id: string;
  version: number;
  createdAt: string;
  changeSummary: string;
  stepCount: number;
  status: 'active' | 'draft' | 'archived';
}

const ACTION_OPTIONS: { value: ActionType; label: string; icon: string }[] = [
  { value: 'click', label: 'Click Element', icon: '👆' },
  { value: 'navigate', label: 'Navigate to URL', icon: '🔗' },
  { value: 'input', label: 'Input Text', icon: '⌨️' },
  { value: 'extract', label: 'Extract Data', icon: '📋' },
  { value: 'wait', label: 'Wait', icon: '⏱️' },
  { value: 'screenshot', label: 'Screenshot', icon: '📸' },
  { value: 'scroll', label: 'Scroll', icon: '📜' },
  { value: 'assert', label: 'Assert Element', icon: '✅' },
];

const TRIGGER_OPTIONS: { value: TriggerType; label: string; icon: typeof Clock }[] = [
  { value: 'manual', label: 'Manual', icon: Play },
  { value: 'scheduled', label: 'Scheduled', icon: Clock },
  { value: 'event', label: 'Event-Driven', icon: Zap },
];

const MOCK_INITIAL_STEPS: WorkflowStep[] = [
  { id: 's-1', action: 'navigate', targetUrl: 'https://competitor.com/products', selector: '', value: '', description: 'Navigate to product listing' },
  { id: 's-2', action: 'extract', targetUrl: 'https://competitor.com/products', selector: '.product-card .price', value: '', description: 'Extract product prices' },
  { id: 's-3', action: 'extract', targetUrl: 'https://competitor.com/products', selector: '.product-card .name', value: '', description: 'Extract product names' },
  { id: 's-4', action: 'screenshot', targetUrl: 'https://competitor.com/products', selector: '', value: '', description: 'Capture screenshot' },
];

const MOCK_VERSIONS: VersionRecord[] = [
  { id: 'v-3', version: 3, createdAt: '2026-07-01T09:00:00Z', changeSummary: 'Added screenshot step for visual verification', stepCount: 4, status: 'active' },
  { id: 'v-2', version: 2, createdAt: '2026-06-20T14:30:00Z', changeSummary: 'Updated selectors to match new site layout', stepCount: 3, status: 'archived' },
  { id: 'v-1', version: 1, createdAt: '2026-05-15T08:00:00Z', changeSummary: 'Initial workflow created', stepCount: 3, status: 'draft' },
];

function StepCard({
  step,
  index,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  step: WorkflowStep;
  index: number;
  onUpdate: (id: string, data: Partial<WorkflowStep>) => void;
  onRemove: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="group relative rounded-[20px] border border-white/[0.07] bg-black/30 p-4 backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5L5 1L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="text-[10px] font-mono text-zinc-600">{index + 1}</span>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{ACTION_OPTIONS.find(a => a.value === step.action)?.icon}</span>
              <select
                value={step.action}
                onChange={(e) => onUpdate(step.id, { action: e.target.value as ActionType })}
                className="rounded-lg border border-white/[0.07] bg-black px-3 py-1.5 text-xs font-medium text-white focus:border-red-500/30 focus:outline-none"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => onRemove(step.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500">Target URL</label>
              <div className="relative">
                <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600" />
                <input
                  type="text"
                  value={step.targetUrl}
                  onChange={(e) => onUpdate(step.id, { targetUrl: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full h-8 rounded-lg border border-white/[0.07] bg-black/50 pl-7 pr-2.5 text-xs text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500">CSS Selector</label>
              <div className="relative">
                <MousePointerClick className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600" />
                <input
                  type="text"
                  value={step.selector}
                  onChange={(e) => onUpdate(step.id, { selector: e.target.value })}
                  placeholder=".class-name or #id"
                  className="w-full h-8 rounded-lg border border-white/[0.07] bg-black/50 pl-7 pr-2.5 text-xs text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium text-zinc-500">Description</label>
            <input
              type="text"
              value={step.description}
              onChange={(e) => onUpdate(step.id, { description: e.target.value })}
              placeholder="What this step does..."
              className="w-full h-8 rounded-lg border border-white/[0.07] bg-black/50 px-2.5 text-xs text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function EditWorkflowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState('Daily Price Monitor');
  const [description, setDescription] = useState('Monitors competitor pricing for top 10 products and alerts when price drops exceed 10%.');
  const [triggerType, setTriggerType] = useState<TriggerType>('scheduled');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [steps, setSteps] = useState<WorkflowStep[]>(MOCK_INITIAL_STEPS);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: generateId(),
        action: 'click',
        targetUrl: '',
        selector: '',
        value: '',
        description: '',
      },
    ]);
  };

  const updateStep = (stepId: string, data: Partial<WorkflowStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...data } : s)));
  };

  const removeStep = (stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const newSteps = [...steps];
    const target = index + direction;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setSteps(newSteps);
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSaving(false);
    router.push(`/workflows/${id}`);
  };

  const handleTestRun = async () => {
    setTesting(true);
    setTestResult(null);
    await new Promise((r) => setTimeout(r, 2500));
    setTesting(false);
    setTestResult(Math.random() > 0.3 ? 'success' : 'failure');
  };

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
            <h1 className="text-2xl font-black tracking-tight text-white">Edit Workflow</h1>
            <p className="mt-1 text-sm text-zinc-500">Modify workflow steps and configuration</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleTestRun}
            disabled={testing || steps.length === 0}
            className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-all"
          >
            {testing ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...</>
            ) : (
              <><Bug className="h-3.5 w-3.5" /> Test Run</>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving || !name.trim() || steps.length === 0}
            className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-40 transition-all shadow-lg shadow-red-500/20"
          >
            {saving ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
            ) : (
              <><Save className="h-3.5 w-3.5" /> Save as New Version</>
            )}
          </motion.button>
        </div>
      </div>

      {/* Test Result Banner */}
      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3',
              testResult === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/10'
                : 'border-red-500/20 bg-red-500/10',
            )}
          >
            {testResult === 'success' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-400">All steps completed successfully</p>
              </>
            ) : (
              <>
                <Bug className="h-4 w-4 text-red-400" />
                <p className="text-sm font-medium text-red-400">Step 2 failed: element .product-card .price not found on page</p>
              </>
            )}
            <button
              onClick={() => setTestResult(null)}
              className="ml-auto text-zinc-500 hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-6">
        {/* Main Editor */}
        <div className="flex-1 space-y-6">
          {/* Basic Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl space-y-4"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Basic Information</h2>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Workflow Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 rounded-xl border border-white/[0.07] bg-black px-4 text-sm text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/[0.07] bg-black px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none resize-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Trigger Type</label>
              <div className="grid grid-cols-3 gap-2">
                {TRIGGER_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = triggerType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setTriggerType(opt.value)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all',
                        selected
                          ? 'border-red-500/30 bg-red-500/10 text-red-400'
                          : 'border-white/[0.07] bg-black/50 text-zinc-500 hover:text-zinc-300 hover:border-white/15',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {triggerType === 'scheduled' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-1.5"
              >
                <label className="text-xs font-medium text-zinc-400">Cron Expression</label>
                <div className="relative">
                  <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full h-10 rounded-xl border border-white/[0.07] bg-black pl-10 pr-4 text-sm font-mono text-white focus:border-red-500/30 focus:outline-none"
                  />
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Steps */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-white">Steps</h2>
                <span className="text-[10px] text-zinc-600">({steps.length})</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={addStep}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-400 transition-all shadow-lg shadow-red-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Step
              </motion.button>
            </div>

            <AnimatePresence mode="popLayout">
              {steps.map((step, index) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={index}
                  onUpdate={updateStep}
                  onRemove={removeStep}
                  onMoveUp={() => moveStep(index, -1)}
                  onMoveDown={() => moveStep(index, 1)}
                  isFirst={index === 0}
                  isLast={index === steps.length - 1}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Version History Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className={cn(
            'w-72 shrink-0 rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl h-fit sticky top-6 space-y-4 transition-all',
          )}
        >
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Version History</h2>
            </div>
            <svg
              className={cn('h-4 w-4 text-zinc-500 transition-transform', showVersions && 'rotate-180')}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <AnimatePresence>
            {showVersions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {MOCK_VERSIONS.map((v) => (
                  <div
                    key={v.id}
                    className={cn(
                      'rounded-xl border p-3 transition-all cursor-pointer hover:bg-white/[0.03]',
                      v.status === 'active'
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-white/[0.05] bg-white/[0.02]',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-white">v{v.version}</span>
                      {v.status === 'active' && (
                        <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">Active</span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">{v.changeSummary}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[9px] text-zinc-600">
                      <FileClock className="h-3 w-3" />
                      {formatDate(v.createdAt)}
                      <span className="ml-auto">{v.stepCount} steps</span>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-px bg-white/[0.07]" />

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="text-zinc-500">Current Version</span>
              <span className="font-semibold text-white">v{MOCK_VERSIONS[0].version}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="text-zinc-500">Steps</span>
              <span className="font-semibold text-white">{steps.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="text-zinc-500">Trigger</span>
              <span className="font-semibold capitalize text-white">{triggerType}</span>
            </div>
          </div>

          <button
            onClick={() => router.push(`/workflows/${id}/versions`)}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <History className="h-3.5 w-3.5" />
            View Full History
          </button>
        </motion.div>
      </div>
    </div>
  );
}
