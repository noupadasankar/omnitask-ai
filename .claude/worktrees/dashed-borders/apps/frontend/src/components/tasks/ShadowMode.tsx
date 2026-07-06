'use client';

import React, { useEffect, useState } from 'react';
import { BrowserPreview } from './BrowserPreview';
import { ExecutionTimeline } from './ExecutionTimeline';
import ApprovalModal from './ApprovalModal';
import { useSocket } from '@/providers/SocketProvider';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Terminal,
} from 'lucide-react';
import type { PlannedStep } from '@/types/agent';

interface ShadowModeProps {
  sessionId: string;
  steps?: PlannedStep[];
  currentStepIndex?: number;
  className?: string;
}

export default function ShadowMode({
  sessionId,
  steps = [],
  currentStepIndex = 0,
  className = '',
}: ShadowModeProps) {
  const { user } = useAuth();
  const { joinSession, leaveSession, logs } = useSocket();
  const [isLogsExpanded, setIsLogsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'timeline' | 'logs'>(
    'preview',
  );

  useEffect(() => {
    if (!sessionId || !user?.id) return;
    joinSession(sessionId, user.id);
    return () => leaveSession(sessionId);
  }, [sessionId, user?.id, joinSession, leaveSession]);

  const timelineSteps = steps.map((step) => ({
    index: step.index,
    description: step.description,
    status: 'pending' as const,
    riskLevel: step.riskLevel,
  }));

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <ApprovalModal />

      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BrowserPreview sessionId={sessionId} />
        </div>
        <div>
          <ExecutionTimeline
            steps={timelineSteps}
            currentStepIndex={currentStepIndex}
            totalSteps={steps.length}
          />
        </div>
      </div>

      <div className="lg:hidden">
        <div className="mb-3 flex border-b border-gray-700">
          {(['preview', 'timeline', 'logs'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-400 text-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'preview' && <BrowserPreview sessionId={sessionId} />}
        {activeTab === 'timeline' && (
          <ExecutionTimeline
            steps={timelineSteps}
            currentStepIndex={currentStepIndex}
            totalSteps={steps.length}
          />
        )}
        {activeTab === 'logs' && (
          <LogPanel logs={logs} isExpanded onToggle={() => {}} />
        )}
      </div>

      <div className="hidden lg:block">
        <LogPanel
          logs={logs}
          isExpanded={isLogsExpanded}
          onToggle={() => setIsLogsExpanded(!isLogsExpanded)}
        />
      </div>
    </div>
  );
}

function LogPanel({
  logs,
  isExpanded,
  onToggle,
}: {
  logs: Array<{ level: string; message: string; timestamp: number }>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const logEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const icons = {
    info: <Info className="h-3 w-3 text-blue-400" />,
    warn: <AlertTriangle className="h-3 w-3 text-yellow-400" />,
    error: <AlertCircle className="h-3 w-3 text-red-400" />,
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-gray-800"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-green-400" />
          <span className="text-sm font-medium text-white">Execution Logs</span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-500">
            {logs.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="max-h-48 overflow-y-auto border-t border-gray-700 bg-gray-950 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="py-4 text-center text-gray-600">No logs yet...</p>
          ) : (
            <div className="space-y-0.5 p-2">
              {logs.map((log, i) => (
                <div key={`${log.timestamp}-${i}`} className="flex items-start gap-2 py-0.5">
                  <span className="flex-shrink-0 text-gray-600">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  {icons[log.level as keyof typeof icons] ?? icons.info}
                  <span className="text-gray-300">{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
