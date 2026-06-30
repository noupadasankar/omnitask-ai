'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ===========================================================
   TYPES
=========================================================== */

interface DashboardHeroProps {
  onSubmit?: (data: { prompt: string; mode: string; priority: string }) => void;
  isLoading?: boolean;
}

/* ===========================================================
   MODES & PRIORITIES
=========================================================== */

const MODES = [
  { id: 'autonomous', label: 'Autonomous', desc: 'Full auto-pilot' },
  { id: 'supervised', label: 'Supervised', desc: 'Requires approvals' },
  { id: 'manual', label: 'Manual', desc: 'Step-by-step control' },
];

const PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
];

/* ===========================================================
   COMPONENT
=========================================================== */

export function DashboardHero({ onSubmit, isLoading }: DashboardHeroProps) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('autonomous');
  const [priority, setPriority] = useState('normal');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit?.({ prompt: prompt.trim(), mode, priority });
    setPrompt('');
  };

  return (
    <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
          <Sparkles className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-white">
            Launch New Task
          </h2>
          <p className="text-[11px] text-zinc-500">
            Describe what you want the agent to do
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Prompt Input */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Scrape product prices from Amazon and export to CSV..."
          rows={3}
          className="w-full resize-none rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:bg-white/[0.04] focus:outline-none transition-all"
        />

        {/* Mode + Priority Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode */}
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all',
                  mode === m.id
                    ? 'bg-red-500/10 text-red-400'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Priority */}
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
            {PRIORITIES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriority(p.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all',
                  priority === p.id
                    ? 'bg-red-500/10 text-red-400'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Submit */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="ml-auto flex h-9 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isLoading ? 'Launching...' : 'Launch Task'}
          </motion.button>
        </div>
      </form>
    </div>
  );
}

export default DashboardHero;
