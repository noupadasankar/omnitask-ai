'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  Settings,
  ChevronLeft,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentsApi } from '@/lib/api';

const TABS = [
  { id: '', label: 'Overview', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'memory', label: 'Memory', icon: BrainCircuit },
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
] as const;

export default function AgentDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.id as string;

  const [agentName, setAgentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    agentsApi
      .get(id)
      .then((res) => setAgentName(res.data?.name ?? 'Agent'))
      .catch(() => setAgentName('Agent'))
      .finally(() => setLoading(false));
  }, [id]);

  const basePath = `/agents/${id}`;
  const activeTab = TABS.find((t) => pathname === `${basePath}/${t.id}` || (t.id === '' && pathname === basePath))?.id ?? '';

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Back link */}
      <button
        onClick={() => router.push('/agents')}
        className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-white"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Agents
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
            <Cpu className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              {loading ? 'Loading...' : agentName}
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 font-mono">ID: {id}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-black/20 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => router.push(`${basePath}/${tab.id}`)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap',
                active
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Page content */}
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
