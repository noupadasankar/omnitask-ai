'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Bot,
  Sliders,
  Cpu,
  Layers,
  Clock,
  Shield,
  Activity,
  Zap,
  HelpCircle,
  Play,
  ArrowRight,
  TrendingUp,
  BrainCircuit,
  MessageSquare,
  Globe,
  Code,
  FileText,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Check,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useCreateTask } from '@/hooks/useTasks';

/* ===========================================================
   TEMPLATES & QUICK STARTS
=========================================================== */

const QUICK_TEMPLATES = [
  {
    title: 'Competitor Price Monitor',
    prompt: 'Scrape product prices for iPhone 15 from Amazon and BestBuy, and compile them into a markdown comparison table.',
    icon: DollarSign,
    category: 'E-commerce',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    model: 'gpt-4o',
    mode: 'autonomous',
  },
  {
    title: 'Google News Digest',
    prompt: 'Search Google for the latest news on "Artificial Intelligence breakthroughs in 2026", extract key points from top 5 articles, and summarize in a digest.',
    icon: Globe,
    category: 'Research',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    model: 'claude-3-5',
    mode: 'autonomous',
  },
  {
    title: 'Uptime & API Checker',
    prompt: 'Query our local health endpoints (http://localhost:4000/api/health), check database connectivity, and generate a system diagnostics report.',
    icon: Cpu,
    category: 'System Admin',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    model: 'gpt-4o',
    mode: 'supervised',
  },
  {
    title: 'Code Review Agent',
    prompt: 'Examine files under apps/frontend/src/config for any circular dependencies or type safety issues, then suggest refactoring steps.',
    icon: Code,
    category: 'Development',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    model: 'llama-3',
    mode: 'supervised',
  },
];

const MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', speed: 'Fast', cost: '$$$', intelligence: 'Excellent' },
  { id: 'claude-3-5', name: 'Claude 3.5 Sonnet', speed: 'Moderate', cost: '$$', intelligence: 'Superior' },
  { id: 'gemini-1-5', name: 'Gemini 1.5 Pro', speed: 'Blazing', cost: '$', intelligence: 'Good' },
  { id: 'llama-3', name: 'LLaMA 3 (Local)', speed: 'Varies', cost: 'Free', intelligence: 'Fair' },
];

const AUTOPILOT_LEVELS = [
  { id: 'autonomous', label: 'Autonomous Autopilot', desc: 'Agent acts independently and completes steps on its own.' },
  { id: 'supervised', label: 'Supervised Control', desc: 'Agent pauses and requests operator approval before destructive actions.' },
  { id: 'manual', label: 'Manual Approval', desc: 'Operator confirms every action and step in real time.' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  useSocket(user?.id); // Keep socket connection established in background
  const createTask = useCreateTask();

  // Page States
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [mode, setMode] = useState('autonomous');
  const [priority, setPriority] = useState('normal');
  const [maxSteps, setMaxSteps] = useState(40);
  const [timeout, setTimeoutVal] = useState(600);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [screenshotStream, setScreenshotStream] = useState(true);
  const [bypassCache, setBypassCache] = useState(false);

  // Model Menu dropdown states
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Custom loader sequence
  const [isLaunchingSequence, setIsLaunchingSequence] = useState(false);
  const [launchStep, setLaunchStep] = useState(0);

  // Close model menu click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quick select template
  const handleSelectTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setPrompt(tpl.prompt);
    setModel(tpl.model);
    setMode(tpl.mode);
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || createTask.isPending || isLaunchingSequence) return;

    // Trigger launcher animation steps
    setIsLaunchingSequence(true);
    setLaunchStep(1);

    setTimeout(() => setLaunchStep(2), 700);
    setTimeout(() => setLaunchStep(3), 1500);
    setTimeout(() => setLaunchStep(4), 2200);

    try {
      const task = await createTask.mutateAsync({
        naturalLanguage: prompt.trim(),
        // @ts-ignore
        mode,
        priority,
        metadata: {
          model,
          maxSteps,
          timeout,
          screenshotStream,
          bypassCache,
        },
      });

      // Navigate to task detail page after a short delay for dramatic loading effect
      setTimeout(() => {
        setIsLaunchingSequence(false);
        router.push(`/tasks/${task.id}`);
      }, 2800);
    } catch {
      setIsLaunchingSequence(false);
    }
  };

  return (
    <div className="relative space-y-8 animate-fade-up w-full max-w-5xl mx-auto">
      {/* BACKGROUND GLOWS */}
      <div className="absolute top-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-red-500/[0.03] blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-15%] h-[600px] w-[600px] rounded-full bg-purple-500/[0.02] blur-3xl pointer-events-none" />

      {/* HEADER SECTION */}
      <div className="w-full text-center sm:text-left">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3.5 py-1.5 text-xs text-red-300">
          <Sparkles className="h-3.5 w-3.5" />
          Autonomous Agent Orchestration Engine
        </div>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white md:text-5xl">
          Launch New Task
        </h1>
        <p className="mt-2 text-zinc-400 max-w-3xl leading-relaxed">
          Instruct our web agent in natural language. The system will parse the plan, spin up a secure sandboxed Chromium session, and execute the workflow autonomously.
        </p>
      </div>

      {/* UNIFIED WORKSPACE CARD - Full Width Playground */}
      <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.02] overflow-hidden backdrop-blur-xl">
        <form onSubmit={handleLaunch} className="flex flex-col p-6 space-y-6">
          
          {/* Header Row: Task Instruction Label + Reasoning LLM Core dropdown */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-1 gap-3">
            <label className="text-sm font-semibold text-zinc-300">Task Instruction</label>
            
            {/* Planner Core LLM Select Dropdown (replaces Natural Language Parser) */}
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setModelMenuOpen(!modelMenuOpen)}
                className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2 text-xs text-zinc-300 hover:bg-white/[0.04] transition-all hover:border-white/15 focus:outline-none"
              >
                <BrainCircuit className="h-3.5 w-3.5 text-red-400 animate-pulse" />
                <span>Model: <strong className="text-white font-bold">{MODELS.find(m => m.id === model)?.name}</strong></span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform", modelMenuOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {modelMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl z-20 backdrop-blur-xl space-y-0.5"
                  >
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest border-b border-white/[0.06] mb-1.5">
                      Select Reasoning Core
                    </div>

                    {MODELS.map((m) => {
                      const active = model === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setModel(m.id);
                            setModelMenuOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-xl transition-all text-left",
                            active
                              ? "bg-red-500/10 border border-red-500/15 text-white"
                              : "border border-transparent hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold">{m.name}</p>
                            <p className="text-[10px] text-zinc-500 leading-tight">
                              Intel: {m.intelligence} · Cost: {m.cost}
                            </p>
                          </div>
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide",
                            active
                              ? "border-red-500/20 bg-red-500/10 text-red-400"
                              : "border-zinc-800 text-zinc-500"
                          )}>
                            {m.speed}
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Textarea Instruction Input */}
          <div className="relative group">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the agent to do... (e.g. Scrape the latest product listings for graphic design monitors on Amazon and export them to a table)"
              rows={6}
              className="w-full resize-none rounded-2xl border border-white/[0.07] bg-black/40 px-5 py-4 text-[14px] text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:bg-black/60 focus:outline-none transition-all duration-300 leading-relaxed font-sans"
            />
            <div className="absolute right-4 bottom-4 flex items-center gap-2">
              <span className="text-[10px] text-zinc-650 font-mono">{prompt.length} characters</span>
            </div>
          </div>

          {/* Supervision Levels */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 block px-1">Supervision Level</label>
            <div className="grid gap-3 sm:grid-cols-3">
              {AUTOPILOT_LEVELS.map((lvl) => {
                const active = mode === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setMode(lvl.id)}
                    className={cn(
                      'flex flex-col text-left p-4 rounded-2xl border transition-all duration-300 bg-black/20 hover:bg-black/40 cursor-pointer',
                      active
                        ? 'border-red-500/30 bg-red-500/[0.03] shadow-md shadow-red-500/5'
                        : 'border-white/[0.05] hover:border-white/10'
                    )}
                  >
                    <span className={cn('text-[13px] font-bold', active ? 'text-red-400' : 'text-white')}>
                      {lvl.label}
                    </span>
                    <span className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                      {lvl.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority Row */}
          <div className="flex items-center gap-4 pt-1">
            <span className="text-xs text-zinc-400 font-semibold px-1">Task Priority:</span>
            <div className="flex gap-1 bg-black/40 rounded-xl p-1 border border-white/[0.05]">
              {['low', 'normal', 'high', 'critical'].map((pr) => (
                <button
                  key={pr}
                  type="button"
                  onClick={() => setPriority(pr)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all',
                    priority === pr
                      ? 'bg-red-500/10 text-red-400 border border-red-500/10'
                      : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {pr}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Configurations */}
          <div className="border-t border-white/[0.06] pt-5">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors px-1"
            >
              <Sliders className={cn('h-3.5 w-3.5 transition-transform duration-300', showAdvanced && 'rotate-180')} />
              {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Configuration'}
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-6 sm:grid-cols-2 bg-black/30 border border-white/[0.05] rounded-2xl p-5">
                    
                    {/* Sliders */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-400 font-semibold">Maximum Steps Cap</span>
                          <span className="font-mono text-red-400">{maxSteps} steps</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          step="5"
                          value={maxSteps}
                          onChange={(e) => setMaxSteps(Number(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-400 font-semibold">Execution Timeout</span>
                          <span className="font-mono text-red-400">{timeout}s</span>
                        </div>
                        <input
                          type="range"
                          min="60"
                          max="1800"
                          step="60"
                          value={timeout}
                          onChange={(e) => setTimeoutVal(Number(e.target.value))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                      </div>
                    </div>

                    {/* Toggles */}
                    <div className="space-y-3 flex flex-col justify-center">
                      <label className="flex items-center justify-between text-xs cursor-pointer group">
                        <div>
                          <span className="text-zinc-300 font-semibold block">Real-time Screenshots</span>
                          <span className="text-[10px] text-zinc-500">Stream container displays visual frames</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={screenshotStream}
                          onChange={(e) => setScreenshotStream(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500 relative peer-checked:after:bg-white" />
                      </label>

                      <label className="flex items-center justify-between text-xs cursor-pointer group pt-2 border-t border-white/[0.05]">
                        <div>
                          <span className="text-zinc-300 font-semibold block">Bypass Cache Stores</span>
                          <span className="text-[10px] text-zinc-500">Force raw browser navigations and skip cached states</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={bypassCache}
                          onChange={(e) => setBypassCache(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500 relative peer-checked:after:bg-white" />
                      </label>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Row */}
          <div className="flex justify-end pt-4 border-t border-white/[0.06]">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={!prompt.trim() || createTask.isPending || isLaunchingSequence}
              className="w-full sm:w-auto flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 px-8 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-4 w-4 fill-current" />
              Compile & Deploy Task
            </motion.button>
          </div>

        </form>
      </div>

      {/* QUICK TEMPLATES SECTION */}
      <div className="space-y-4 w-full">
        <h2 className="text-lg font-bold text-white px-1">Quick Start Templates</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 w-full">
          {QUICK_TEMPLATES.map((tpl, i) => {
            const Icon = tpl.icon;
            return (
              <motion.div
                key={i}
                whileHover={{ y: -4, border: 'border-white/20' }}
                onClick={() => handleSelectTemplate(tpl)}
                className={cn(
                  'group rounded-2xl border bg-white/[0.01] p-5 transition-all duration-300 cursor-pointer backdrop-blur-md flex flex-col justify-between hover:bg-white/[0.03]',
                  tpl.border
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                      {tpl.category}
                    </span>
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tpl.bg, tpl.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-[14px] font-bold text-white mb-2 leading-snug">
                    {tpl.title}
                  </h3>
                  <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3">
                    {tpl.prompt}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-[10px] text-zinc-650 font-semibold group-hover:text-red-400 transition-colors">
                  Use prompt
                  <ArrowRight className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* DETAILED LAUNCH OVERLAY */}
      <AnimatePresence>
        {isLaunchingSequence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
          >
            <div className="max-w-md w-full mx-4 rounded-3xl border border-white/10 bg-zinc-950 p-8 text-center space-y-6 shadow-2xl">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
                <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
              </div>

              <div>
                <h3 className="text-xl font-black tracking-tight text-white">
                  Compiling & Deploying Task
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Initializing agents and spinning up workspace sandbox
                </p>
              </div>

              {/* TIMELINE SIMULATION */}
              <div className="bg-black/40 border border-white/[0.05] rounded-xl p-4 text-left font-mono text-[11px] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className={cn(launchStep >= 1 ? 'text-emerald-400' : 'text-zinc-600')}>
                    [1/4] Parsing natural language prompt...
                  </span>
                  {launchStep > 1 ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : launchStep === 1 ? (
                    <Loader2 className="h-3 w-3 text-red-400 animate-spin" />
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn(launchStep >= 2 ? 'text-emerald-400' : 'text-zinc-600')}>
                    [2/4] Initializing Planner Core ({model.toUpperCase()})...
                  </span>
                  {launchStep > 2 ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : launchStep === 2 ? (
                    <Loader2 className="h-3 w-3 text-red-400 animate-spin" />
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn(launchStep >= 3 ? 'text-emerald-400' : 'text-zinc-600')}>
                    [3/4] Structuring execution plan graph...
                  </span>
                  {launchStep > 3 ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : launchStep === 3 ? (
                    <Loader2 className="h-3 w-3 text-red-400 animate-spin" />
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn(launchStep >= 4 ? 'text-emerald-400' : 'text-zinc-600')}>
                    [4/4] Activating Chromium Sandbox container...
                  </span>
                  {launchStep >= 4 ? (
                    <Loader2 className="h-3 w-3 text-red-400 animate-spin" />
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}