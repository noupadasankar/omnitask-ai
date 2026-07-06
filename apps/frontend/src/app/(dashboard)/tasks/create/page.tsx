'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Zap, ArrowRight, Globe, ShoppingCart, Briefcase,
  Mail, UtensilsCrossed, Search, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const EXAMPLES = [
  { icon: Globe,           text: 'Book a flight from NYC to LA next Friday'                          },
  { icon: ShoppingCart,    text: 'Order noise-cancelling headphones under $100'                      },
  { icon: Briefcase,       text: 'Apply to 5 remote React developer jobs on LinkedIn'                },
  { icon: Mail,            text: 'Summarise my unread emails and flag urgent ones'                   },
  { icon: UtensilsCrossed, text: 'Order dinner for 2 from the nearest Thai restaurant'               },
  { icon: Search,          text: 'Research the top 3 competitors to Notion and summarise pricing'    },
];

const MODES = [
  { id: 'approval_required', label: 'Supervised',  desc: 'Agent pauses for your approval before any irreversible action.'   },
  { id: 'autonomous',        label: 'Autonomous',  desc: 'Agent executes end-to-end without interruptions.'                  },
  { id: 'simulation',        label: 'Simulation',  desc: 'Dry run — generates a plan without executing anything.'            },
] as const;

export default function CreateTaskPage() {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState<'approval_required' | 'autonomous' | 'simulation'>('approval_required');
  const [loading, setLoading] = useState(false);

  const launch = () => {
    if (!goal.trim()) return;
    setLoading(true);
    const params = new URLSearchParams({ goal: goal.trim(), mode });
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <Zap className="h-3.5 w-3.5 text-red-400" />
          New Task
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Create Task</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Describe what you want the AI to do — it will plan and execute it for you.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
      >
        <label className="mb-2 block text-xs font-semibold text-zinc-400">What should the agent do?</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.metaKey && launch()}
          placeholder="e.g. Book a table for 2 at a sushi restaurant near Times Square for tonight at 7pm"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none transition-all"
        />
        <p className="mt-1.5 text-[10px] text-zinc-700">Press ⌘↵ to launch</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
      >
        <label className="mb-3 block text-xs font-semibold text-zinc-400">Execution Mode</label>
        <div className="space-y-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                mode === m.id ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-white/[0.06] bg-white/[0.01] hover:border-white/15',
              )}
            >
              <div className={cn(
                'mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 transition-all',
                mode === m.id ? 'border-red-500 bg-red-500' : 'border-zinc-700',
              )} />
              <div>
                <p className={cn('text-sm font-semibold', mode === m.id ? 'text-red-300' : 'text-zinc-300')}>
                  {m.label}
                </p>
                <p className="mt-0.5 text-xs text-zinc-600">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
      >
        <label className="mb-3 block text-xs font-semibold text-zinc-400">Example Prompts</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setGoal(ex.text)}
              className="flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-left text-xs text-zinc-400 transition-all hover:border-white/15 hover:text-zinc-200"
            >
              <ex.icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-600" />
              {ex.text}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        onClick={launch}
        disabled={!goal.trim() || loading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Launch Agent
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </motion.button>
    </div>
  );
}
