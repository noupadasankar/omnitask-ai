'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Database, Zap, Globe, RefreshCw, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthData {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  checks: Record<string, { status: string; latencyMs?: number }>;
  circuitBreakers: Array<{
    name: string;
    state: string;
    failureCount: number;
    cooldownEndsAt: string | null;
  }>;
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  database: Database,
  redis: Zap,
  python_agent: Globe,
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'up' || status === 'healthy') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> UP
      </span>
    );
  }
  if (status === 'degraded') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400">
        <AlertTriangle className="h-3 w-3" /> DEGRADED
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-400">
      <XCircle className="h-3 w-3" /> DOWN
    </span>
  );
}

function CircuitBreakerBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    CLOSED: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    OPEN: 'border-red-500/20 bg-red-500/10 text-red-400',
    HALF_OPEN: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  };
  return (
    <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold',
      map[state] ?? 'border-white/10 bg-white/5 text-zinc-400')}>
      {state}
    </span>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
      const res = await fetch(`${base}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthData = await res.json();
      setHealth(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Could not reach backend');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const overallColor =
    health?.status === 'healthy' ? 'text-emerald-400' :
    health?.status === 'degraded' ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <Shield className="h-3.5 w-3.5 text-red-400" />
            System Status
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Health</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live infrastructure status — auto-refreshes every 30 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[11px] text-zinc-600">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !health && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <span className="ml-3 text-sm text-zinc-500">Checking system health…</span>
        </div>
      )}

      {error && !health && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.03] py-16 text-center">
          <XCircle className="mb-4 h-10 w-10 text-red-500/50" />
          <p className="text-sm font-semibold text-white">Backend unreachable</p>
          <p className="mt-1 text-xs text-zinc-500">{error}</p>
          <button onClick={fetchHealth} className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]">
            Retry
          </button>
        </div>
      )}

      {health && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'flex items-center gap-4 rounded-2xl border p-5',
              health.status === 'healthy'
                ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                : health.status === 'degraded'
                  ? 'border-amber-500/20 bg-amber-500/[0.04]'
                  : 'border-red-500/20 bg-red-500/[0.04]',
            )}
          >
            <Activity className={cn('h-8 w-8', overallColor)} />
            <div>
              <p className={cn('text-xl font-black uppercase tracking-wider', overallColor)}>
                {health.status}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                v{health.version} · {new Date(health.timestamp).toLocaleString()}
              </p>
            </div>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-3">
            {Object.entries(health.checks).map(([name, check], i) => {
              const Icon = SERVICE_ICONS[name] ?? Activity;
              return (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                      <Icon className="h-5 w-5 text-zinc-400" />
                    </div>
                    <StatusBadge status={check.status} />
                  </div>
                  <p className="text-sm font-bold text-white capitalize">{name.replace(/_/g, ' ')}</p>
                  {check.latencyMs !== undefined && (
                    <p className="mt-1 font-mono text-xs text-zinc-500">{check.latencyMs}ms latency</p>
                  )}
                </motion.div>
              );
            })}
          </div>

          {health.circuitBreakers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl"
            >
              <h2 className="mb-4 text-sm font-bold text-white">Circuit Breakers</h2>
              <div className="space-y-3">
                {health.circuitBreakers.map((cb, i) => (
                  <motion.div
                    key={cb.name}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-white">{cb.name}</p>
                      {cb.failureCount > 0 && (
                        <p className="mt-0.5 text-[10px] text-zinc-600">{cb.failureCount} failures</p>
                      )}
                    </div>
                    <CircuitBreakerBadge state={cb.state} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
