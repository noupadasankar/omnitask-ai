'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { generateId } from '@/lib/utils';

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

const TRIGGER_OPTIONS: { value: TriggerType; label: string; description: string; icon: typeof Clock }[] = [
  { value: 'manual', label: 'Manual', description: 'Run on-demand from dashboard', icon: Play },
  { value: 'scheduled', label: 'Scheduled', description: 'Run on a cron schedule', icon: Clock },
  { value: 'event', label: 'Event-Driven', description: 'Triggered by webhook or event', icon: Zap },
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
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5L5 1L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="text-[10px] font-mono text-zinc-600">{index + 1}</span>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
            <label className="text-[10px] font-medium text-zinc-500">Description (optional)</label>
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

export default function CreateWorkflowPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('manual');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [saving, setSaving] = useState<'draft' | 'active' | null>(null);

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

  const updateStep = (id: string, data: Partial<WorkflowStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const newSteps = [...steps];
    const target = index + direction;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setSteps(newSteps);
  };

  const handleSave = async (mode: 'draft' | 'active') => {
    setSaving(mode);
    await new Promise((r) => setTimeout(r, 1200));
    setSaving(null);
    router.push('/workflows');
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
          <h1 className="text-2xl font-black tracking-tight text-white">Create Workflow</h1>
          <p className="mt-1 text-sm text-zinc-500">Define a sequence of automated browser actions</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-6">
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
                placeholder="e.g. Daily Price Monitor"
                className="w-full h-10 rounded-xl border border-white/[0.07] bg-black px-4 text-sm text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this workflow does..."
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
                      <span className="text-[10px] leading-tight text-zinc-600">{opt.description}</span>
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
                    placeholder="0 9 * * *"
                    className="w-full h-10 rounded-xl border border-white/[0.07] bg-black pl-10 pr-4 text-sm font-mono text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-zinc-600">Minute · Hour · Day · Month · Weekday</p>
              </motion.div>
            )}
          </motion.div>

          {/* Step Builder */}
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

            {steps.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.07] py-12 text-center">
                <Workflow className="h-8 w-8 text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-500">No steps yet</p>
                <p className="text-xs text-zinc-600 mt-1">Add your first workflow step to get started</p>
              </div>
            )}

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

            {steps.length > 0 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                <button
                  onClick={addStep}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all"
                >
                  <Plus className="h-3 w-3" />
                  Add Another Step
                </button>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
              </div>
            )}
          </motion.div>
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl space-y-4 sticky top-6"
          >
            <h2 className="text-sm font-semibold text-white">Summary</h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-zinc-500">Name</span>
                <span className="text-xs text-white font-medium truncate max-w-[140px]">{name || '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-zinc-500">Trigger</span>
                <span className="text-xs capitalize text-white font-medium">{triggerType}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-zinc-500">Steps</span>
                <span className="text-xs text-white font-medium">{steps.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-zinc-500">Status</span>
                <span className="text-[10px] text-yellow-400 font-semibold">Draft</span>
              </div>
            </div>

            <div className="h-px bg-white/[0.07]" />

            <div className="space-y-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleSave('draft')}
                disabled={!name.trim() || saving !== null}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.06] hover:text-white disabled:opacity-40 transition-all"
              >
                {saving === 'draft' ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" /></svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save as Draft
                  </>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleSave('active')}
                disabled={!name.trim() || steps.length === 0 || saving !== null}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-40 transition-all shadow-lg shadow-red-500/20"
              >
                {saving === 'active' ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" /></svg>
                    Activating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Save & Activate
                  </>
                )}
              </motion.button>
            </div>

            <p className="text-[10px] text-zinc-600 text-center">
              {!name.trim()
                ? 'Enter a name to save'
                : steps.length === 0
                  ? 'Add at least one step to activate'
                  : 'Ready to save'}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
