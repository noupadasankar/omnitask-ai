'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2, XCircle, RotateCcw } from 'lucide-react';

export interface TimelineStep {
  stepIndex: number;
  stepType: string;
  action: string;
  status: string;
  output?: unknown;
  errorMessage?: string;
  startedAt?: string;
  durationMs?: number;
}

const statusIcon: Record<string, React.ReactNode> = {
  COMPLETED: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  RUNNING: <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />,
  FAILED: <XCircle className="h-4 w-4 text-red-400" />,
  PENDING: <Circle className="h-4 w-4 text-slate-500" />,
  SKIPPED: <Circle className="h-4 w-4 text-slate-600" />,
};

export function ExecutionTimeline({ steps }: { steps: TimelineStep[] }) {
  if (!steps.length) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">No execution steps yet.</p>
    );
  }

  return (
    <ol className="relative border-l border-slate-700 ml-3 space-y-6">
      {steps.map((step) => (
        <li key={step.stepIndex} className="ml-6">
          <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 ring-4 ring-slate-950">
            {statusIcon[step.status] ?? statusIcon.PENDING}
          </span>
          <div
            className={cn(
              'rounded-lg border p-4',
              step.status === 'FAILED'
                ? 'border-red-500/40 bg-red-950/20'
                : 'border-slate-700 bg-slate-900/40',
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-white">
                Step {step.stepIndex + 1}: {step.action}
              </span>
              <div className="flex items-center gap-2">
                {step.status === 'FAILED' && (
                  <span className="text-xs flex items-center gap-1 text-amber-400">
                    <RotateCcw className="h-3 w-3" />
                    Retry eligible
                  </span>
                )}
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    step.status === 'COMPLETED' && 'bg-emerald-500/20 text-emerald-300',
                    step.status === 'RUNNING' && 'bg-blue-500/20 text-blue-300',
                    step.status === 'FAILED' && 'bg-red-500/20 text-red-300',
                    step.status === 'PENDING' && 'bg-slate-700 text-slate-400',
                  )}
                >
                  {step.status}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500">{step.stepType}</p>
            {step.durationMs != null && (
              <p className="text-xs text-slate-600 mt-1">{step.durationMs}ms</p>
            )}
            {step.errorMessage && (
              <p className="text-xs text-red-400 mt-2">{step.errorMessage}</p>
            )}
            {step.output != null && (
              <pre className="mt-2 text-xs bg-slate-950 rounded p-2 overflow-x-auto text-slate-400 max-h-32">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
