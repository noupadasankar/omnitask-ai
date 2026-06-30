'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Server, RefreshCw, Loader2, Lock,
  Database, Users, Activity, FileText, BrainCircuit, ScrollText, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/services/api';

interface SystemStats {
  users: number;
  tasks: number;
  sessions: number;
  memories: number;
  files: number;
  auditLogs: number;
}

interface HealthData {
  status: string;
  checks: Record<string, { status: string; latencyMs?: number }>;
  circuitBreakers?: Array<{ name: string; state: string; failureCount: number }>;
}

export default function AdminSystemPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, healthRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/health').catch(() => ({ data: null })),
      ]);
      setStats(statsRes.data);
      setHealth(healthRes.data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load system data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/5">
          <Lock className="h-8 w-8 text-red-500/60" />
        </div>
        <p className="text-lg font-black text-white">Access Denied</p>
        <p className="text-sm text-zinc-500">Current role: <span className="text-zinc-400 font-semibold">{user?.role}</span></p>
      </div>
    );
  }

  const overallHealthy = health?.status === 'healthy';
  const overallDegraded = health?.status === 'degraded';

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            <Shield className="h-3.5 w-3.5" />
            Admin · System Health
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">System</h1>
          <p className="mt-1 text-sm text-zinc-500">Infrastructure status and database metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <div className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
              overallHealthy ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' :
              overallDegraded ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' :
              'border-red-500/20 bg-red-500/10 text-red-400'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse',
                overallHealthy ? 'bg-emerald-400' : overallDegraded ? 'bg-amber-400' : 'bg-red-400')} />
              {(health.status ?? 'unknown').toUpperCase()}
            </div>
          )}
          <button onClick={load} disabled={loading}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <span className="ml-3 text-sm text-zinc-500">Loading system data…</span>
        </div>
      ) : (
        <>
          {/* Database stats */}
          {stats && (
            <div>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Database Records</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { icon: Users,       label: 'Users',       value: stats.users,     color: 'text-blue-400'    },
                  { icon: Activity,    label: 'Tasks',       value: stats.tasks,     color: 'text-purple-400'  },
                  { icon: Server,      label: 'Sessions',    value: stats.sessions,  color: 'text-amber-400'   },
                  { icon: BrainCircuit,label: 'Memories',    value: stats.memories,  color: 'text-cyan-400'    },
                  { icon: FileText,    label: 'Files',       value: stats.files,     color: 'text-emerald-400' },
                  { icon: ScrollText,  label: 'Audit Logs',  value: stats.auditLogs, color: 'text-zinc-400'    },
                ].map((item, i) => (
                  <motion.div key={item.label}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
                    <item.icon className={cn('mb-3 h-5 w-5', item.color)} />
                    <p className="text-2xl font-black text-white">{item.value.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Service health checks */}
          {health?.checks && (
            <div>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Service Health</h2>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
                <div className="space-y-3">
                  {Object.entries(health.checks).map(([name, check]) => (
                    <div key={name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={cn('h-2 w-2 rounded-full flex-shrink-0',
                          check.status === 'up' ? 'bg-emerald-400' : 'bg-red-400')} />
                        <span className="text-sm font-medium capitalize text-zinc-300">
                          {name.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {check.latencyMs !== undefined && (
                          <span className="text-xs text-zinc-600 font-mono">{check.latencyMs}ms</span>
                        )}
                        <span className={cn('text-xs font-bold',
                          check.status === 'up' ? 'text-emerald-400' : 'text-red-400')}>
                          {check.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}

          {/* Circuit breakers */}
          {health?.circuitBreakers && health.circuitBreakers.length > 0 && (
            <div>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Circuit Breakers</h2>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
                <div className="space-y-3">
                  {health.circuitBreakers.map(cb => (
                    <div key={cb.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={cn('h-2 w-2 rounded-full flex-shrink-0',
                          cb.state === 'CLOSED' ? 'bg-emerald-400' :
                          cb.state === 'HALF_OPEN' ? 'bg-amber-400' : 'bg-red-400')} />
                        <span className="text-sm font-medium text-zinc-300 font-mono">{cb.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {cb.failureCount > 0 && (
                          <span className="text-xs text-red-400 font-mono">{cb.failureCount} failures</span>
                        )}
                        <span className={cn('text-xs font-bold font-mono',
                          cb.state === 'CLOSED' ? 'text-emerald-400' :
                          cb.state === 'HALF_OPEN' ? 'text-amber-400' : 'text-red-400')}>
                          {cb.state}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
