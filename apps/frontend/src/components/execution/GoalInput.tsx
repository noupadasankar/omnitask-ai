'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, ShieldAlert, Cpu, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GoalInputProps {
  onStart: (payload: {
    goal: string;
    mode: 'autonomous' | 'approval_required' | 'simulation';
    maxBudget?: number;
    allowPayments?: boolean;
    allowLogin?: boolean;
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
  const [goal, setGoal] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [mode, setMode] = useState<'autonomous' | 'approval_required' | 'simulation'>('approval_required');
  const [maxBudget, setMaxBudget] = useState<number>(500);
  const [allowPayments, setAllowPayments] = useState(false);
  const [allowLogin, setAllowLogin] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    });
  };

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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
