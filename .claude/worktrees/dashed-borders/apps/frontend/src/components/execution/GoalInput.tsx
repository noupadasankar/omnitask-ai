'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, ShieldAlert, Cpu, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/store/agent.store';
import * as agentApi from '@/services/agent.service';

interface GoalInputProps {
  onStart: (payload: {
    goal: string;
    mode: 'autonomous' | 'approval_required' | 'simulation';
    maxBudget?: number;
    allowPayments?: boolean;
    allowLogin?: boolean;
    profile?: 'conservative' | 'balanced' | 'aggressive';
  }) => void;
  loading: boolean;
}

const PLACEHOLDERS = [
  'Order me a chicken biryani under ₹300',
  'Book a movie ticket for tonight on Paytm',
  'Find the cheapest flight to Bangalore',
  'Pay my electricity bill',
  'Compare laptops and order the best one',
  'Reserve a hotel room in Delhi for next week',
];

const QUICK_CHIPS = [
  { label: 'Order Pizza', query: 'Order a veg cheese burst pizza from Swiggy' },
  { label: 'Cheapest Flight', query: 'Find the cheapest flight from Mumbai to Bangalore next Monday' },
  { label: 'Book Movie', query: 'Book 2 tickets for latest Marvel movie on BookMyShow' },
  { label: 'Bill Payment', query: 'Pay my BESCOM electricity bill' },
];

export function GoalInput({ onStart, loading }: GoalInputProps) {
  const store = useAgentStore();
  const [goal, setGoal] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [mode, setMode] = useState<'autonomous' | 'approval_required' | 'simulation'>('approval_required');
  const [maxBudget, setMaxBudget] = useState<number>(500);
  const [allowPayments, setAllowPayments] = useState(false);
  const [allowLogin, setAllowLogin] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // ─── COS Execution Profile ───────────────────────────────────────────
  const [profile, setProfile] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [refining, setRefining] = useState(false);

  // Cycling placeholder
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || loading) return;
    onStart({
      goal: goal.trim(),
      mode,
      maxBudget: maxBudget || undefined,
      allowPayments,
      allowLogin,
      profile,
    });
  };

  const handleClarificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarificationAnswer.trim() || refining) return;
    
    setRefining(true);
    try {
      // 1. Refine intent using backend LLM goal refinement
      const refined = await agentApi.refineGoal(store.parsedGoal, clarificationAnswer);
      
      // 2. Clear ambiguity gate
      store.setClarificationQuestions(null);
      setClarificationAnswer('');
      
      // 3. Start execution with the refined, clear goal
      onStart({
        ...store.clarificationGoal,
        goal: refined.intent,
      });
    } catch (err) {
      console.error('Goal refinement failed:', err);
    } finally {
      setRefining(false);
    }
  };

  if (store.clarificationQuestions && store.clarificationQuestions.length > 0) {
    return (
      <div className="relative w-full rounded-3xl border border-red-500/30 bg-zinc-950/50 p-6 backdrop-blur-2xl shadow-2xl">
        <div className="absolute inset-0 cyber-grid opacity-5 rounded-3xl pointer-events-none" />
        
        <form onSubmit={handleClarificationSubmit} className="relative z-10 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse" />
            <div>
              <h3 className="text-xs font-mono font-bold tracking-widest text-red-400 uppercase">
                Goal Clarification Gate
              </h3>
              <p className="text-[9px] font-mono text-zinc-500 mt-0.5">
                The objective is too ambiguous. Please provide more details.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              Clarifying Question(s):
            </div>
            <div className="space-y-2">
              {store.clarificationQuestions.map((question, idx) => (
                <div key={idx} className="text-sm font-semibold text-white pl-3 border-l-2 border-red-500">
                  {question}
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 pl-5 transition-all focus-within:border-red-500/40">
            <input
              type="text"
              placeholder="Your answer or clarification..."
              value={clarificationAnswer}
              onChange={(e) => setClarificationAnswer(e.target.value)}
              disabled={refining}
              className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder-zinc-500"
            />
            
            <button
              type="submit"
              disabled={!clarificationAnswer.trim() || refining}
              className="flex h-11 px-4 items-center justify-center rounded-xl bg-red-500 text-xs font-bold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
            >
              {refining ? 'Refining...' : 'Submit Answers'}
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                store.setClarificationQuestions(null);
                store.setClarificationGoal(null);
              }}
              className="text-xs font-mono text-zinc-500 hover:text-white transition-all"
            >
              Cancel & Start Over
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-3xl border border-white/10 bg-zinc-950/40 p-6 backdrop-blur-2xl transition-all shadow-2xl">
      <div className="absolute inset-0 cyber-grid opacity-5 rounded-3xl pointer-events-none" />

      <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
        {/* Core Input Field */}
        <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 pl-5 transition-all focus-within:border-red-500/40 focus-within:shadow-[0_0_20px_rgba(239,68,68,0.15)]">
          <Sparkles className="h-5 w-5 text-red-500 animate-pulse flex-shrink-0" />
          
          <div className="relative flex-1">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={loading}
              className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder-zinc-500"
            />
            {goal === '' && (
              <div className="absolute inset-0 pointer-events-none flex items-center text-sm font-semibold text-zinc-500">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 0.6, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    {PLACEHOLDERS[placeholderIndex]}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!goal.trim() || loading}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl bg-red-500 text-white transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none flex-shrink-0",
              loading && "animate-pulse"
            )}
          >
            {loading ? <Cpu className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        {!loading && (
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="text-zinc-500 font-mono">QUICK START:</span>
            {QUICK_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setGoal(chip.query)}
                className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5 font-medium text-zinc-400 transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-white"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Advanced Filters Expand Toggle */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-mono text-zinc-500 hover:text-white transition-all flex items-center gap-1.5"
          >
            {showAdvanced ? '[-] HIDE PARAMETERS' : '[+] ADVANCED MODE CONFIG'}
          </button>

          {loading && (
            <div className="flex items-center gap-2 text-xs font-mono text-red-500 uppercase tracking-widest animate-pulse">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Agent Core Deploying...
            </div>
          )}
        </div>

        {/* Advanced Mode Filters Grid */}
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-4 border-t border-white/5 pt-4 md:grid-cols-3">
                {/* 1. Mode Select */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 tracking-wider">EXECUTION MODE</label>
                  <div className="flex rounded-xl bg-black/60 border border-white/5 p-1 gap-1">
                    {(['autonomous', 'approval_required', 'simulation'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                          "flex-1 text-center py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                          mode === m
                            ? "bg-red-500/10 border border-red-500/20 text-red-400"
                            : "text-zinc-500 hover:text-white"
                        )}
                      >
                        {m === 'approval_required' ? 'Approval' : m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Budget Constraint */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 tracking-wider">MAX BUDGET (INR)</label>
                  <div className="flex items-center gap-2 rounded-xl bg-black/60 border border-white/5 px-3 py-1">
                    <span className="text-zinc-500 text-xs font-semibold">₹</span>
                    <input
                      type="number"
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(Number(e.target.value))}
                      className="bg-transparent text-xs font-semibold text-white outline-none w-full"
                    />
                  </div>
                </div>

                {/* 3. Safety Checkboxes */}
                <div className="space-y-1.5 flex flex-col justify-end">
                  <div className="flex items-center gap-6 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-mono text-zinc-400">
                      <input
                        type="checkbox"
                        checked={allowPayments}
                        onChange={(e) => setAllowPayments(e.target.checked)}
                        className="rounded border-white/10 bg-black/60 text-red-500 focus:ring-0 focus:ring-offset-0 h-4.5 w-4.5"
                      />
                      ALLOW PAYMENTS
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-mono text-zinc-400">
                      <input
                        type="checkbox"
                        checked={allowLogin}
                        onChange={(e) => setAllowLogin(e.target.checked)}
                        className="rounded border-white/10 bg-black/60 text-red-500 focus:ring-0 focus:ring-offset-0 h-4.5 w-4.5"
                      />
                      ALLOW LOGIN
                    </label>
                  </div>
                </div>

                {/* 4. COS Execution Profile ──────────────────────────────────── */}
                <div className="space-y-1.5 md:col-span-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-mono text-zinc-500 tracking-wider">COGNITIVE PROFILE</label>
                    <span className="text-[9px] font-mono text-zinc-600 bg-white/5 border border-white/5 px-2 py-0.5 rounded">COS RUNTIME</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      {
                        key: 'conservative',
                        label: 'Conservative',
                        desc: 'High confidence gates · Strict drift thresholds · Fewer retries',
                        color: 'indigo',
                      },
                      {
                        key: 'balanced',
                        label: 'Balanced',
                        desc: 'Default thresholds · Adaptive retries · Moderate drift tolerance',
                        color: 'cyan',
                      },
                      {
                        key: 'aggressive',
                        label: 'Aggressive',
                        desc: 'Low gate thresholds · Maximum retries · Exploration-tolerant drift',
                        color: 'red',
                      },
                    ] as const).map(({ key, label, desc, color }) => {
                      const isSelected = profile === key;
                      const borderCol = color === 'indigo' ? 'border-indigo-500/40' : color === 'cyan' ? 'border-cyan-500/40' : 'border-red-500/40';
                      const bgCol = color === 'indigo' ? 'bg-indigo-500/10' : color === 'cyan' ? 'bg-cyan-500/10' : 'bg-red-500/10';
                      const textCol = color === 'indigo' ? 'text-indigo-400' : color === 'cyan' ? 'text-cyan-400' : 'text-red-400';
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setProfile(key)}
                          className={cn(
                            'relative flex flex-col gap-1 p-3 rounded-xl border text-left transition-all',
                            isSelected
                              ? `${borderCol} ${bgCol}`
                              : 'border-white/5 bg-black/30 hover:border-white/10'
                          )}
                        >
                          {isSelected && (
                            <div className={cn('absolute top-2 right-2 h-2 w-2 rounded-full', color === 'indigo' ? 'bg-indigo-400' : color === 'cyan' ? 'bg-cyan-400' : 'bg-red-400')} />
                          )}
                          <span className={cn('text-[10px] font-bold font-mono uppercase tracking-wider', isSelected ? textCol : 'text-zinc-400')}>
                            {label}
                          </span>
                          <span className="text-[9px] text-zinc-600 leading-relaxed">{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
