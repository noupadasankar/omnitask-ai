'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  Clock,
  Gauge,
  Zap,
  AlertTriangle,
  Loader2,
  Terminal,
  Bot,
} from 'lucide-react';
import { cn, timeAgo, formatDuration } from '@/lib/utils';
import { agentsApi } from '@/lib/api';

interface AgentDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string;
  tasksCompleted: number;
  successRate: number;
  avgDurationMs: number;
  uptime: number;
  config: Record<string, unknown>;
  recentActivity: Array<{
    id: string;
    action: string;
    status: string;
    timestamp: string;
  }>;
}

const MOCK_AGENT: AgentDetail = {
  id: '',
  name: '',
  type: 'autonomous',
  status: 'RUNNING',
  description: 'Autonomous agent for executing browser-based tasks with real-time approval layers.',
  tasksCompleted: 142,
  successRate: 94.7,
  avgDurationMs: 34500,
  uptime: 99.2,
  config: {
    mode: 'approval_required',
    maxConcurrency: 3,
    headless: true,
    allowedDomains: ['*.linkedin.com', '*.github.com', '*.google.com'],
  },
  recentActivity: [
    { id: '1', action: 'Completed job application on LinkedIn', status: 'COMPLETED', timestamp: new Date(Date.now() - 120000).toISOString() },
    { id: '2', action: 'Extracted data from GitHub profile', status: 'COMPLETED', timestamp: new Date(Date.now() - 600000).toISOString() },
    { id: '3', action: 'Approval requested: submit form', status: 'WAITING', timestamp: new Date(Date.now() - 1800000).toISOString() },
    { id: '4', action: 'Session paused by user', status: 'PAUSED', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: '5', action: 'Task failed: login timeout', status: 'FAILED', timestamp: new Date(Date.now() - 7200000).toISOString() },
  ],
};

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    agentsApi
      .get(id)
      .then((res) => setAgent({ ...MOCK_AGENT, ...res.data, id }))
      .catch(() => setAgent({ ...MOCK_AGENT, id, name: 'Research Agent' }))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-red-400" />
        <p className="mt-3 text-sm text-zinc-500">Loading agent details...</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-red-500/20 bg-red-500/[0.03] py-16 text-center">
        <AlertTriangle className="h-6 w-6 text-red-400" />
        <p className="mt-3 text-sm font-medium text-white">Could not load agent</p>
        <p className="mt-1 text-xs text-zinc-500">{error ?? 'Agent not found'}</p>
      </div>
    );
  }

  const statusColor = agent.status === 'RUNNING' ? 'text-emerald-400' : agent.status === 'PAUSED' ? 'text-yellow-400' : 'text-zinc-400';

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6">
      {/* Agent header card */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
              <Bot className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{agent.name}</h2>
              <div className="mt-1 flex items-center gap-3">
                <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                  {agent.type}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className={cn('h-1.5 w-1.5 rounded-full', agent.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500')} />
                  <span className={cn('text-[11px] font-semibold', statusColor)}>{agent.status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">{agent.description}</p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Tasks Completed" value={agent.tasksCompleted} color="text-emerald-400" />
        <StatCard icon={Gauge} label="Success Rate" value={`${agent.successRate}%`} color="text-blue-400" />
        <StatCard icon={Clock} label="Avg Duration" value={formatDuration(agent.avgDurationMs)} color="text-purple-400" />
        <StatCard icon={Zap} label="Uptime" value={`${agent.uptime}%`} color="text-yellow-400" />
      </div>

      {/* Recent Activity + Config */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-400" />
            <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
          </div>
          <div className="space-y-2">
            {agent.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    activity.status === 'COMPLETED' ? 'bg-emerald-400' :
                    activity.status === 'FAILED' ? 'bg-red-400' :
                    activity.status === 'WAITING' ? 'bg-yellow-400' : 'bg-zinc-500',
                  )} />
                  <p className="text-xs text-zinc-300">{activity.action}</p>
                </div>
                <span className="text-[10px] text-zinc-600">{timeAgo(activity.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Config Summary */}
        <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-red-400" />
            <h3 className="text-sm font-semibold text-white">Configuration</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(agent.config).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                <span className="text-xs text-zinc-500 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-xs font-medium text-white">
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/15">
      <div className="mb-4 flex items-center justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]', color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
