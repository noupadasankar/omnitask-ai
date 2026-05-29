'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Play,
  Pause,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  Eye,
  Zap,
  Terminal,
  Bot,
} from 'lucide-react';

import { useTask, usePauseTask, useResumeTask, useDeleteTask } from '@/hooks/useTasks';
import { useAuth } from '@/hooks/useAuth';
import { useSocket as useAgentFeed } from '@/hooks/useSocket';
import ShadowMode from '@/components/tasks/ShadowMode';
import { startAgentExecution, getAgentSessionSteps } from '@/services/agent.service';
import type { PlannedStep } from '@/types/agent';
import { TaskStatusBadge } from '@/components/tasks/TaskStatusBadge';
import { cn, timeAgo, formatDuration } from '@/lib/utils';

/* ===========================================================
   TYPES
=========================================================== */

interface ExecutionStep {
  id: string;
  stepType: string;
  action: string;
  status: 'completed' | 'running' | 'failed' | 'pending';
  output?: string;
  error?: string;
  duration?: number;
  agent?: string;
}

/* ===========================================================
   MOCK STEPS
=========================================================== */

const MOCK_STEPS: ExecutionStep[] = [
  { id: '1', stepType: 'plan', action: 'Decompose task into subtasks', status: 'completed', duration: 1200, agent: 'PlannerAgent' },
  { id: '2', stepType: 'navigate', action: 'Navigate to target URL', status: 'completed', duration: 3400, agent: 'BrowserAgent' },
  { id: '3', stepType: 'scrape', action: 'Extract product data', status: 'completed', duration: 5600, agent: 'BrowserAgent' },
  { id: '4', stepType: 'validate', action: 'Validate scraped schema', status: 'completed', duration: 800, agent: 'PolicyEngine' },
  { id: '5', stepType: 'transform', action: 'Transform to CSV format', status: 'running', duration: undefined, agent: 'ExecutionCore' },
  { id: '6', stepType: 'export', action: 'Save to cloud storage', status: 'pending', duration: undefined, agent: 'ExecutionCore' },
  { id: '7', stepType: 'notify', action: 'Send Slack notification', status: 'pending', duration: undefined, agent: 'PlannerAgent' },
];

/* ===========================================================
   COMPONENT
=========================================================== */

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task, isLoading, refetch } = useTask(id);
  const { user } = useAuth();
  const { connected, events } = useAgentFeed(user?.id);
  const pauseTask = usePauseTask();
  const resumeTask = useResumeTask();
  const deleteTask = useDeleteTask();

  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<PlannedStep[]>([]);
  const [agentStepIndex, setAgentStepIndex] = useState(0);
  const [startingAgent, setStartingAgent] = useState(false);

  const steps: ExecutionStep[] = (task as any)?.steps ?? MOCK_STEPS;

  const runningSteps = steps.filter((s: ExecutionStep) => s.status === 'running').length;
  const completedSteps = steps.filter((s: ExecutionStep) => s.status === 'completed').length;
  const failedSteps = steps.filter((s: ExecutionStep) => s.status === 'failed').length;
  const progress = Math.round((completedSteps / steps.length) * 100);

  useEffect(() => {
    if (task?.status === 'RUNNING' && runningSteps === 0 && completedSteps === steps.length) {
      refetch();
    }
  }, [steps, task, runningSteps, completedSteps, refetch]);

  useEffect(() => {
    if (!agentSessionId) return;
    const interval = setInterval(async () => {
      try {
        const data = await getAgentSessionSteps(agentSessionId);
        setAgentSteps(data.steps || []);
        setAgentStepIndex(data.currentStepIndex || 0);
      } catch {
        /* session may have ended */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [agentSessionId]);

  const handleStartBrowserAgent = async () => {
    if (!id || !task?.naturalLanguage) return;
    setStartingAgent(true);
    try {
      const { sessionId } = await startAgentExecution({
        taskId: id,
        goal: task.naturalLanguage,
        config: { headless: true, viewport: { width: 1280, height: 720 } },
      });
      setAgentSessionId(sessionId);
    } catch (err) {
      console.error('Failed to start agent:', err);
    } finally {
      setStartingAgent(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-red-400" />
          <p className="text-sm text-zinc-500">Loading task details...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white">Task Not Found</h2>
          <p className="mt-2 text-sm text-zinc-500">This task may have been deleted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => window.history.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-white">
                {task.title || 'Untitled Task'}
              </h1>
              <TaskStatusBadge status={task.status} size="sm" />
            </div>

            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              {task.naturalLanguage}
            </p>

            <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-600">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo(task.createdAt)}
              </span>
              {task.agent && (
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  {task.agent}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartBrowserAgent}
            disabled={startingAgent || !!agentSessionId}
            className="flex h-9 items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
          >
            {startingAgent ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {agentSessionId ? 'Agent Running' : 'Shadow Mode'}
          </button>

          {task.status === 'RUNNING' && (
            <button
              onClick={() => pauseTask.mutate(id!)}
              disabled={pauseTask.isPending}
              className="flex h-9 items-center gap-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 text-sm font-semibold text-yellow-400 hover:bg-yellow-500/20 transition-all disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          )}

          {task.status === 'PAUSED' && (
            <button
              onClick={() => resumeTask.mutate(id!)}
              disabled={resumeTask.isPending}
              className="flex h-9 items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
          )}

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>

          <button
            onClick={() => deleteTask.mutate(id!)}
            className="flex h-9 items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-all"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-semibold text-zinc-400">
            Execution Progress
          </span>
          <span className="text-[12px] font-mono font-bold text-red-400">
            {progress}%
          </span>
        </div>

        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 relative"
          >
            {/* Shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-progress" />
          </motion.div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            {completedSteps} completed
          </span>
          <span className="flex items-center gap-1">
            <Loader2 className={cn('h-3 w-3', runningSteps > 0 && 'animate-spin text-blue-400')} />
            {runningSteps} running
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {failedSteps} failed
          </span>
        </div>
      </div>

      {agentSessionId && (
        <ShadowMode
          sessionId={agentSessionId}
          steps={agentSteps}
          currentStepIndex={agentStepIndex}
        />
      )}

      {/* MAIN GRID */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* LEFT - EXECUTION TIMELINE */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-white">
              Execution Timeline
            </h2>

            <button
              onClick={() => setShowLogs(!showLogs)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all',
                showLogs
                  ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                  : 'bg-white/[0.02] border border-white/[0.07] text-zinc-500 hover:text-white',
              )}
            >
              <Terminal className="h-3 w-3" />
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {steps.map((step: ExecutionStep, i: number) => {
              const isActive = step.status === 'running';
              const isCompleted = step.status === 'completed';
              const isFailed = step.status === 'failed';

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
                  className={cn(
                    'group relative cursor-pointer rounded-xl border overflow-hidden transition-all duration-300',
                    isActive
                      ? 'border-blue-500/30 bg-blue-500/5'
                      : isCompleted
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : isFailed
                          ? 'border-red-500/20 bg-red-500/5'
                          : 'border-white/[0.05] bg-white/[0.01]',
                  )}
                >
                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div className="absolute left-5 top-12 w-[1px] h-4 bg-white/[0.08] -translate-x-1/2" />
                  )}

                  <div className="flex items-start gap-4 p-4">
                    {/* Status Dot */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full border',
                          isActive
                            ? 'border-blue-500/30 bg-blue-500/10'
                            : isCompleted
                              ? 'border-emerald-500/30 bg-emerald-500/10'
                              : isFailed
                                ? 'border-red-500/30 bg-red-500/10'
                                : 'border-white/[0.1] bg-white/[0.02]',
                        )}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : isFailed ? (
                          <XCircle className="h-5 w-5 text-red-400" />
                        ) : isActive ? (
                          <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-zinc-600" />
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-semibold text-white">
                          {step.action}
                        </h3>
                        {step.agent && (
                          <span className="text-[10px] text-zinc-600">
                            · {step.agent}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                        {step.stepType}
                      </p>

                      {step.duration && (
                        <p className="mt-1 text-[10px] text-zinc-600">
                          {formatDuration(step.duration * 1000)}
                        </p>
                      )}

                      {/* Expand for details */}
                      <AnimatePresence>
                        {activeStep === step.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 overflow-hidden"
                          >
                            {step.output && (
                              <div className="rounded-lg bg-black/40 p-3 border border-white/[0.05]">
                                <p className="text-[10px] font-mono text-zinc-500">
                                  Output:
                                </p>
                                <p className="mt-1 text-[11px] font-mono text-zinc-400 break-all">
                                  {step.output}
                                </p>
                              </div>
                            )}

                            {step.error && (
                              <div className="mt-2 rounded-lg bg-red-500/10 p-3 border border-red-500/20">
                                <p className="text-[10px] font-mono text-red-400">
                                  Error:
                                </p>
                                <p className="mt-1 text-[11px] font-mono text-red-400 break-all">
                                  {step.error}
                                </p>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Expand arrow */}
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-zinc-600 transition-transform',
                        activeStep === step.id && 'rotate-180',
                      )}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* RIGHT - AGENT STATUS + LIVE FEED */}
        <div className="space-y-4">
          {/* Runtime Status */}
          <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-white">
                Runtime Status
              </h3>

              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  connected
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
                )}
              >
                {connected ? (
                  <>
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </>
                ) : (
                  'OFFLINE'
                )}
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Active Agents', value: connected ? '4' : '0', icon: Bot },
                { label: 'Queue Depth', value: '12', icon: Zap },
                { label: 'Avg Latency', value: '142ms', icon: Clock },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2"
                >
                  <span className="text-[11px] text-zinc-500">{stat.label}</span>
                  <span className="text-[11px] font-semibold text-white">
                    {stat.value}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Live Feed */}
          <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
            <h3 className="text-[13px] font-semibold text-white mb-4">
              Live Feed
            </h3>

            <div className="max-h-[280px] overflow-y-auto space-y-2">
              {events.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-zinc-600">
                  Waiting for events...
                </p>
              ) : (
                events.slice(0, 8).map((ev, i) => (
                  <motion.div
                    key={`${ev.at}-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-lg bg-white/[0.02] px-3 py-2"
                  >
                    <p className="text-[10px] font-mono text-emerald-400">
                      {ev.event}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {timeAgo(ev.at)}
                    </p>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}