'use client';

import { useMemo, useState } from 'react';

import {
  ArrowRight,
  BrainCircuit,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
} from 'lucide-react';

import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { useCreateTask } from '@/hooks/useTasks';

import { toast } from 'react-hot-toast';

const examples = [
  'Apply to senior frontend jobs on LinkedIn',
  'Research AI startups in India and generate a report',
  'Find cheapest flights from Hyderabad to Dubai',
  'Generate a market analysis presentation',
];

const modes = [
  {
    id: 'browser',
    label: 'Browser',
    icon: Globe,
  },
  {
    id: 'workflow',
    label: 'Workflow',
    icon: Workflow,
  },
  {
    id: 'agent',
    label: 'Agents',
    icon: BrainCircuit,
  },
];

export function TaskCreateForm() {
  const [prompt, setPrompt] = useState('');

  const [selectedMode, setSelectedMode] =
    useState('browser');

  const createTask = useCreateTask();

  const canSubmit = useMemo(() => {
    return (
      prompt.trim().length > 5 &&
      !createTask.isPending
    );
  }, [prompt, createTask.isPending]);

  const handleSubmit = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!prompt.trim()) return;

    try {
      await createTask.mutateAsync({
        naturalLanguage: prompt.trim(),
      });

      toast.success(
        'Execution pipeline initialized',
      );

      setPrompt('');
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err
          ? (
              err as {
                response?: {
                  data?: {
                    message?: string;
                  };
                };
              }
            ).response?.data?.message
          : 'Failed to create task';

      toast.error(msg || 'Task failed');
    }
  };

  return (
    <div className="space-y-5">
      {/* MODES */}
      <div className="flex flex-wrap gap-3">
        {modes.map((mode) => {
          const Icon = mode.icon;

          const active =
            selectedMode === mode.id;

          return (
            <button
              key={mode.id}
              type="button"
              onClick={() =>
                setSelectedMode(mode.id)
              }
              className={`
                flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-all
                ${
                  active
                    ? 'border-red-500/20 bg-red-500/10 text-red-300'
                    : 'border-white/10 bg-black/20 text-zinc-400 hover:bg-white/[0.03]'
                }
              `}
            >
              <Icon className="h-4 w-4" />

              {mode.label}
            </button>
          );
        })}
      </div>

      {/* MAIN PROMPT */}
      <form
        onSubmit={handleSubmit}
        className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/30"
      >
        {/* GLOW */}
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-red-500/10 blur-3xl" />

        {/* TOP */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
              <Sparkles className="h-5 w-5 text-red-400" />
            </div>

            <div>
              <h3 className="font-semibold text-white">
                Autonomous Task
              </h3>

              <p className="text-xs text-zinc-500">
                Natural language execution engine
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 md:flex">
            <ShieldCheck className="h-3 w-3" />

            Policy Protected
          </div>
        </div>

        {/* TEXTAREA */}
        <div className="relative z-10 px-6 py-5">
          <textarea
            placeholder="Describe what you want OmniTask AI to execute..."
            value={prompt}
            onChange={(e) =>
              setPrompt(e.target.value)
            }
            rows={5}
            className="
              terminal-text
              w-full
              resize-none
              border-none
              bg-transparent
              text-base
              text-white
              outline-none
              placeholder:text-zinc-600
            "
          />

          {/* EXAMPLES */}
          <div className="mt-6 flex flex-wrap gap-3">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() =>
                  setPrompt(example)
                }
                className="
                  rounded-full
                  border
                  border-white/10
                  bg-white/[0.03]
                  px-4
                  py-2
                  text-xs
                  text-zinc-400
                  transition-all
                  hover:border-red-500/20
                  hover:bg-red-500/10
                  hover:text-red-300
                "
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* BOTTOM */}
        <div className="relative z-10 flex flex-col gap-4 border-t border-white/10 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          {/* LEFT STATUS */}
          <div className="flex flex-wrap items-center gap-4">
            <StatusDot
              label="GPT-4o Planner"
              active
            />

            <StatusDot
              label="Execution Graph"
              active
            />

            <StatusDot
              label="Live Runtime"
              active={false}
            />
          </div>

          {/* RIGHT ACTIONS */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="
                hidden
                h-12
                items-center
                gap-2
                rounded-2xl
                border
                border-white/10
                bg-white/[0.03]
                px-5
                text-sm
                text-zinc-300
                transition
                hover:bg-white/[0.05]
                lg:flex
              "
            >
              <Terminal className="h-4 w-4" />

              Shadow Mode
            </button>

            <motion.div
              whileTap={{ scale: 0.98 }}
            >
              <Button
                type="submit"
                disabled={!canSubmit}
                className="
                  h-12
                  rounded-2xl
                  bg-red-500
                  px-6
                  text-sm
                  font-medium
                  text-white
                  hover:bg-red-600
                  disabled:opacity-40
                "
              >
                {createTask.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />

                    Planning Execution...
                  </>
                ) : (
                  <>
                    Launch Task

                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ===================================================== */
/* STATUS */
/* ===================================================== */

function StatusDot({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          h-2.5 w-2.5 rounded-full
          ${
            active
              ? 'animate-pulse-red bg-emerald-400'
              : 'bg-zinc-600'
          }
        `}
      />

      <span className="text-xs text-zinc-500">
        {label}
      </span>
    </div>
  );
}