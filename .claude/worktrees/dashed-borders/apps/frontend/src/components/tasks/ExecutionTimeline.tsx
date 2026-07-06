// frontend/src/components/tasks/ExecutionTimeline.tsx

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import { AlertCircle, CheckCircle2, Clock, Loader2, SkipForward, AlertTriangle } from 'lucide-react';

interface TimelineStep {
  index: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_approval';
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  duration?: number;
  error?: string;
}

interface ExecutionTimelineProps {
  steps?: TimelineStep[];
  currentStepIndex?: number;
  totalSteps?: number;
}

export function ExecutionTimeline({
  steps: initialSteps = [],
  currentStepIndex = 0,
  totalSteps = 0,
}: ExecutionTimelineProps) {
  const { executionEvents } = useSocket();
  const [steps, setSteps] = useState<TimelineStep[]>(initialSteps);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Update steps based on execution events
  useEffect(() => {
    let newSteps = [...steps];

    for (const event of executionEvents) {
      switch (event.type) {
        case 'step:started':
          newSteps = newSteps.map((s) =>
            s.index === event.data.stepIndex ? { ...s, status: 'running' as const } : s,
          );
          break;

        case 'step:completed':
          newSteps = newSteps.map((s) =>
            s.index === event.data.stepIndex
              ? {
                  ...s,
                  status: 'completed' as const,
                  duration: event.data.duration,
                }
              : s,
          );
          break;

        case 'step:failed':
          newSteps = newSteps.map((s) =>
            s.index === event.data.stepIndex
              ? {
                  ...s,
                  status: 'failed' as const,
                  error: event.data.error,
                }
              : s,
          );
          break;

        case 'approval:requested':
          newSteps = newSteps.map((s) =>
            s.index === event.data.stepIndex
              ? {
                  ...s,
                  status: 'waiting_approval' as const,
                  riskLevel: event.data.riskLevel,
                }
              : s,
          );
          break;

        case 'step:blocked':
          newSteps = newSteps.map((s) =>
            s.index === event.data.stepIndex
              ? {
                  ...s,
                  status: 'skipped' as const,
                  error: event.data.reason,
                }
              : s,
          );
          break;
      }
    }

    setSteps(newSteps);
  }, [executionEvents]);

  // Auto-scroll to current step
  useEffect(() => {
    const currentElement = scrollContainerRef.current?.querySelector(
      `[data-step-index="${currentStepIndex}"]`,
    );
    if (currentElement) {
      currentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStepIndex]);

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'LOW':
        return 'text-green-600 bg-green-50';
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50';
      case 'HIGH':
        return 'text-orange-600 bg-orange-50';
      case 'CRITICAL':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-yellow-500" />;
      case 'waiting_approval':
        return <AlertTriangle className="w-4 h-4 text-orange-500 animate-pulse" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border shadow-sm">
      <div className="px-4 py-3 border-b font-semibold text-sm">
        Execution Progress ({currentStepIndex}/{totalSteps})
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto space-y-2 p-4"
      >
        {steps.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No steps yet
          </div>
        ) : (
          steps.map((step) => (
            <div
              key={step.index}
              data-step-index={step.index}
              className={`p-3 border rounded transition-colors ${
                currentStepIndex === step.index
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getStatusIcon(step.status)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">
                      Step {step.index}
                    </span>
                    {step.riskLevel && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getRiskColor(step.riskLevel)}`}>
                        {step.riskLevel}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 truncate mt-1">
                    {step.description}
                  </p>

                  {step.error && (
                    <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">
                      Error: {step.error}
                    </p>
                  )}

                  {step.duration !== undefined && (
                    <p className="text-xs text-gray-500 mt-2">
                      Duration: {step.duration}ms
                    </p>
                  )}
                </div>

                <div className="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-600 whitespace-nowrap">
                  {step.status}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
