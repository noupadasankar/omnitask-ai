'use client';

import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Cpu,
  ShieldAlert,
  Sparkles,
  Workflow,
} from 'lucide-react';

import { motion } from 'framer-motion';

import { TaskCreateForm } from '@/components/tasks/TaskCreateForm';
import { TaskList } from '@/components/tasks/TaskList';
import { AgentStatusPanel } from '@/components/tasks/AgentStatusPanel';

import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useTasks } from '@/hooks/useTasks';

export default function DashboardPage() {
  const { user } = useAuth();

  const { connected, events } = useSocket(user?.id);

  const { data: tasks } = useTasks();

  const running =
    tasks?.filter(
      (t) => t.status === 'RUNNING',
    ).length ?? 0;

  const completed =
    tasks?.filter(
      (t) => t.status === 'COMPLETED',
    ).length ?? 0;

  const failed =
    tasks?.filter(
      (t) => t.status === 'FAILED',
    ).length ?? 0;

  return (
    <div className="space-y-8">
      {/* ================================================= */}
      {/* HERO */}
      {/* ================================================= */}

      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
        {/* BG GLOW */}
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-red-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
          {/* LEFT */}
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              <Sparkles className="h-4 w-4" />

              Autonomous Runtime Active
            </div>

            <h1 className="max-w-3xl text-4xl font-black tracking-[-0.04em] text-white md:text-5xl">
              AI Operations
              <br />

              Command Center
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-400">
              Orchestrate autonomous agents, monitor
              workflows, approve executions, and observe
              real-time task intelligence across your AI
              infrastructure.
            </p>
          </div>

          {/* RIGHT */}
          <div className="grid grid-cols-2 gap-4">
            <MiniStat
              icon={Bot}
              label="Agents"
              value="04"
            />

            <MiniStat
              icon={Workflow}
              label="Workflows"
              value="12"
            />

            <MiniStat
              icon={Activity}
              label="Runtime"
              value="98%"
            />

            <MiniStat
              icon={Cpu}
              label="Executions"
              value="247"
            />
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* STATS */}
      {/* ================================================= */}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Running Tasks"
          value={running}
          icon={Clock3}
          color="text-blue-400"
        />

        <StatCard
          title="Completed"
          value={completed}
          icon={CheckCircle2}
          color="text-emerald-400"
        />

        <StatCard
          title="Failed"
          value={failed}
          icon={ShieldAlert}
          color="text-red-400"
        />

        <StatCard
          title="Agents Online"
          value={connected ? 4 : 0}
          icon={BrainCircuit}
          color="text-purple-400"
        />
      </div>

      {/* ================================================= */}
      {/* MAIN GRID */}
      {/* ================================================= */}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        {/* LEFT */}
        <div className="space-y-6">
          {/* CREATE */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Launch New Task
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Describe a workflow for autonomous
                  execution
                </p>
              </div>

              <div className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-300">
                GPT-4o Planner
              </div>
            </div>

            <TaskCreateForm />
          </div>

          {/* TASKS */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Execution Queue
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Live autonomous workflow executions
                </p>
              </div>

              <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                LIVE
              </div>
            </div>

            <div className="p-2">
              <TaskList limit={8} />
            </div>
          </div>

          {/* EXECUTION FLOW */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Execution Graph
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Autonomous agent orchestration pipeline
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-zinc-400">
                Runtime Visualization
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <FlowNode
                title="Planner"
                active
              />

              <FlowArrow />

              <FlowNode
                title="Browser"
                active
              />

              <FlowArrow />

              <FlowNode
                title="Validator"
                active
              />

              <FlowArrow />

              <FlowNode title="Approval" />

              <FlowArrow />

              <FlowNode title="Executor" />
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* AGENT PANEL */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
            <AgentStatusPanel
              connected={connected}
              events={events}
            />
          </div>

          {/* MEMORY */}
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                AI Memory
              </h2>

              <div className="rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-xs text-purple-300">
                ACTIVE
              </div>
            </div>

            <div className="space-y-4">
              <MemoryCard
                title="Working Memory"
                value="12 Contexts"
              />

              <MemoryCard
                title="Semantic Memory"
                value="247 Embeddings"
              />

              <MemoryCard
                title="Learned Skills"
                value="18 Skills"
              />
            </div>
          </div>

          {/* RUNTIME */}
          <div className="rounded-[28px] border border-red-500/20 bg-red-500/[0.03] p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="animate-pulse-red h-3 w-3 rounded-full bg-red-500" />

              <h2 className="text-lg font-semibold text-red-300">
                Runtime Console
              </h2>
            </div>

            <div className="space-y-3 font-mono text-xs text-zinc-500">
              <p>→ Connecting to runtime...</p>

              <p>→ BrowserAgent initialized</p>

              <p>→ Execution graph compiled</p>

              <p>→ Policy engine validated</p>

              <p className="text-emerald-400">
                → Runtime operational
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================================================== */
/* COMPONENTS */
/* ===================================================== */

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <Icon className="h-5 w-5 text-red-400" />

        <div className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>

      <p className="text-2xl font-bold text-white">
        {value}
      </p>

      <p className="mt-1 text-sm text-zinc-500">
        {label}
      </p>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl"
    >
      <div className="mb-5 flex items-center justify-between">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-black/30 ${color}`}
        >
          <Icon className="h-7 w-7" />
        </div>

        <div className="h-2 w-2 rounded-full bg-emerald-400 opacity-0 transition group-hover:opacity-100" />
      </div>

      <h3 className="text-sm text-zinc-500">
        {title}
      </h3>

      <p className="mt-2 text-4xl font-black text-white">
        {value}
      </p>
    </motion.div>
  );
}

function FlowNode({
  title,
  active,
}: {
  title: string;
  active?: boolean;
}) {
  return (
    <div
      className={`
        flex items-center gap-3 rounded-2xl border px-5 py-4
        ${
          active
            ? 'border-red-500/20 bg-red-500/10 text-red-300'
            : 'border-white/10 bg-black/20 text-zinc-400'
        }
      `}
    >
      <div
        className={`
          h-3 w-3 rounded-full
          ${
            active
              ? 'animate-pulse-red bg-red-500'
              : 'bg-zinc-600'
          }
        `}
      />

      <span className="font-medium">
        {title}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden text-zinc-600 md:block">
      →
    </div>
  );
}

function MemoryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm text-zinc-500">
        {title}
      </p>

      <p className="mt-2 text-lg font-semibold text-white">
        {value}
      </p>
    </div>
  );
}