'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, RefreshCw, Loader2, Lock, AlertTriangle,
  Zap, Database, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/services/api';

interface QuotaUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  quota: {
    plan: string;
    tasksPerDay: number;
    storageBytes: number;
    concurrentTasks: number;
  } | null;
}

const PLAN_TIERS = [
  {
    name: 'Free',
    badge: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400',
    color: 'text-zinc-400',
    border: 'border-zinc-500/20',
    bg: 'bg-zinc-500/5',
    tasksPerDay: 10,
    storageGB: 1,
    concurrentTasks: 2,
    features: ['10 tasks/day', '1 GB storage', '2 concurrent agents', 'Standard models'],
  },
  {
    name: 'Pro',
    badge: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
    color: 'text-blue-400',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/5',
    tasksPerDay: 100,
    storageGB: 10,
    concurrentTasks: 10,
    features: ['100 tasks/day', '10 GB storage', '10 concurrent agents', 'Advanced models'],
  },
  {
    name: 'Enterprise',
    badge: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
    tasksPerDay: -1,
    storageGB: 100,
    concurrentTasks: 50,
    features: ['Unlimited tasks', '100 GB storage', '50 concurrent agents', 'All models + priority'],
  },
];

const SECURITY_POLICIES = [
  { label: 'Session Timeout',     value: '7 days',   icon: Clock,         note: 'JWT expiry — set via JWT_EXPIRY env' },
  { label: 'Max Login Attempts',  value: '5',         icon: Lock,          note: 'Account locked after 5 failures' },
  { label: 'Password Min Length', value: '8 chars',   icon: Shield,        note: 'Enforced at registration' },
  { label: 'CSRF Protection',     value: 'Enabled',   icon: Zap,           note: 'Skipped for Bearer token requests' },
  { label: 'API Rate Limit',      value: '100/min',   icon: Zap,           note: 'Per-IP rate limit on all API routes' },
  { label: 'Email Verification',  value: 'Optional',  icon: CheckCircle2,  note: 'Users can log in before verifying' },
  { label: 'Storage Backend',     value: 'Local FS',  icon: Database,      note: 'STORAGE_PATH env var' },
];

export default function AdminPoliciesPage() {
  const { user } = useAuth();
  const isAdmin      = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const isSuperAdmin = user?.role === 'SUPERADMIN';

  const [users, setUsers]       = useState<QuotaUser[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/users?take=100');
      const raw = res.data;
      setUsers(raw.data ?? raw.users ?? (Array.isArray(raw) ? raw : []));
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isAdmin]);

  const applyQuota = async (userId: string, tier: typeof PLAN_TIERS[number]) => {
    setUpdating(userId);
    try {
      await api.patch(`/admin/users/${userId}/quota`, {
        plan: tier.name.toUpperCase(),
        tasksPerDay: tier.tasksPerDay === -1 ? 99999 : tier.tasksPerDay,
        storageBytes: tier.storageGB * 1024 * 1024 * 1024,
        concurrentTasks: tier.concurrentTasks,
      });
      setSuccess(`Applied ${tier.name} plan`);
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to update quota');
      setTimeout(() => setError(null), 4000);
    } finally {
      setUpdating(null);
    }
  };

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

  return (
    <div className="space-y-8 animate-fade-up">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            <Shield className="h-3.5 w-3.5" />
            Admin · Policies
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Policies</h1>
          <p className="mt-1 text-sm text-zinc-500">Quota tiers, security rules, and user limits.</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          <p className="text-xs text-emerald-400">{success}</p>
        </div>
      )}

      {/* Quota Tiers */}
      <div>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Quota Tiers</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLAN_TIERS.map((tier, i) => (
            <motion.div key={tier.name}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className={cn('rounded-2xl border p-5 backdrop-blur-xl', tier.border, tier.bg)}>
              <div className="mb-4">
                <span className={cn('rounded-full border px-2.5 py-1 text-xs font-black tracking-wider', tier.badge)}>
                  {tier.name.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-5">
                <div>
                  <p className={cn('text-xl font-black', tier.color)}>
                    {tier.tasksPerDay === -1 ? '∞' : tier.tasksPerDay}
                  </p>
                  <p className="text-[9px] text-zinc-600 font-mono uppercase mt-0.5">tasks/day</p>
                </div>
                <div>
                  <p className={cn('text-xl font-black', tier.color)}>{tier.storageGB}<span className="text-sm">GB</span></p>
                  <p className="text-[9px] text-zinc-600 font-mono uppercase mt-0.5">storage</p>
                </div>
                <div>
                  <p className={cn('text-xl font-black', tier.color)}>{tier.concurrentTasks}</p>
                  <p className="text-[9px] text-zinc-600 font-mono uppercase mt-0.5">concurrent</p>
                </div>
              </div>
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                    <CheckCircle2 className={cn('h-3.5 w-3.5 flex-shrink-0', tier.color)} />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Security Policies */}
      <div>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Security &amp; System Policies</h2>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
          <div className="divide-y divide-white/[0.04]">
            {SECURITY_POLICIES.map((policy) => (
              <div key={policy.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
                    <policy.icon className="h-4 w-4 text-zinc-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">{policy.label}</p>
                    <p className="text-[10px] text-zinc-600 truncate">{policy.note}</p>
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-xs font-mono font-semibold text-zinc-300">
                  {policy.value}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* User Quota Management — SUPERADMIN only */}
      {isSuperAdmin && (
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-500">User Quota Management</h2>
          <p className="mb-4 text-[11px] text-zinc-600">Apply a plan tier to any user to change their limits instantly.</p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="rounded-2xl border border-white/[0.07] bg-black/30 backdrop-blur-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-red-400" />
                <span className="ml-3 text-sm text-zinc-500">Loading…</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.05] text-left">
                      {['User', 'Role', 'Plan', 'Tasks/Day', 'Concurrent', 'Apply Tier'].map(h => (
                        <th key={h} className="px-5 pb-3 pt-4 font-semibold text-zinc-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {users.map((u) => {
                      const planName = u.quota?.plan ?? 'FREE';
                      const tier = PLAN_TIERS.find(t => t.name.toUpperCase() === planName.toUpperCase()) ?? PLAN_TIERS[0];
                      const isUpdating = updating === u.id;
                      return (
                        <tr key={u.id} className="transition-colors hover:bg-white/[0.02]">
                          <td className="px-5 py-3">
                            <p className="font-semibold text-white">{u.name || '—'}</p>
                            <p className="text-zinc-600">{u.email}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn(
                              'rounded-full border px-2 py-0.5 text-[9px] font-bold',
                              u.role === 'ADMIN' || u.role === 'SUPERADMIN'
                                ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                                : 'border-white/10 bg-white/[0.04] text-zinc-400',
                            )}>{u.role}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-bold', tier.badge)}>
                              {planName}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-zinc-400 font-mono">
                            {u.quota ? (u.quota.tasksPerDay >= 99999 ? '∞' : u.quota.tasksPerDay) : '—'}
                          </td>
                          <td className="px-5 py-3 text-zinc-400 font-mono">
                            {u.quota?.concurrentTasks ?? '—'}
                          </td>
                          <td className="px-5 py-3">
                            {isUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                            ) : (
                              <div className="flex items-center gap-1.5">
                                {PLAN_TIERS.map(t => (
                                  <button key={t.name}
                                    onClick={() => applyQuota(u.id, t)}
                                    disabled={planName.toUpperCase() === t.name.toUpperCase()}
                                    className={cn(
                                      'rounded-lg border px-2 py-1 text-[9px] font-black tracking-wide transition-all',
                                      planName.toUpperCase() === t.name.toUpperCase()
                                        ? cn(t.badge, 'opacity-60 cursor-default')
                                        : 'border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-white cursor-pointer'
                                    )}>
                                    {t.name.toUpperCase()}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {users.length === 0 && !loading && (
                  <p className="py-10 text-center text-sm text-zinc-600">No users found.</p>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Note for ADMIN (non-super) */}
      {!isSuperAdmin && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <XCircle className="h-4 w-4 flex-shrink-0 text-zinc-600" />
          <p className="text-xs text-zinc-500">
            Quota management requires <span className="font-semibold text-zinc-300">SUPERADMIN</span> privileges.
          </p>
        </div>
      )}
    </div>
  );
}
