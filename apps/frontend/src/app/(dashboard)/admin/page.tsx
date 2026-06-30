'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Users, Activity, Database, RefreshCw, Loader2,
  Lock, BarChart3, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/services/api';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTasks: number;
  totalSessions: number;
  totalMemories: number;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  _count?: { tasks: number; executionSessions: number };
}

export default function AdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users?take=20'),
      ]);
      // Backend returns { users, tasks, sessions, memories, files, auditLogs }
      const s = statsRes.data;
      setStats({
        totalUsers: s.users ?? s.totalUsers ?? 0,
        activeUsers: s.activeUsers ?? s.users ?? 0,
        totalTasks: s.tasks ?? s.totalTasks ?? 0,
        totalSessions: s.sessions ?? s.totalSessions ?? 0,
        totalMemories: s.memories ?? 0,
      });
      // Backend returns { data, total, skip, take }
      const raw = usersRes.data;
      setUsers(raw.data ?? raw.users ?? (Array.isArray(raw) ? raw : []));
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 animate-fade-up text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/5">
          <Lock className="h-8 w-8 text-red-500/60" />
        </div>
        <div>
          <p className="text-lg font-black text-white">Access Denied</p>
          <p className="mt-1 text-sm text-zinc-500">Admin privileges are required to access this page.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Current role: <span className="font-semibold text-zinc-400">{user?.role ?? 'USER'}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            <Shield className="h-3.5 w-3.5" />
            Admin Panel
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Administration</h1>
          <p className="mt-1 text-sm text-zinc-500">System management and user oversight.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
        >
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

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-red-400" />
          <span className="ml-3 text-sm text-zinc-500">Loading admin data…</span>
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Users,     label: 'Total Users',    value: stats.totalUsers,    color: 'text-blue-400'    },
                { icon: Activity,  label: 'Active Users',   value: stats.activeUsers,   color: 'text-emerald-400' },
                { icon: BarChart3, label: 'Total Tasks',    value: stats.totalTasks,    color: 'text-purple-400'  },
                { icon: Database,  label: 'Sessions',       value: stats.totalSessions, color: 'text-amber-400'   },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="rounded-2xl border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
                >
                  <item.icon className={cn('mb-3 h-5 w-5', item.color)} />
                  <p className="text-2xl font-black text-white">{item.value}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.label}</p>
                </motion.div>
              ))}
            </div>
          )}

          {users.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl"
            >
              <h2 className="mb-5 text-sm font-bold text-white">Users ({users.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.05] text-left">
                      {['Name', 'Email', 'Role', 'Joined', 'Tasks'].map((h) => (
                        <th key={h} className="pb-3 pr-4 font-semibold text-zinc-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {users.map((u) => (
                      <tr key={u.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="py-3 pr-4 font-semibold text-white">{u.name || '—'}</td>
                        <td className="py-3 pr-4 text-zinc-400">{u.email}</td>
                        <td className="py-3 pr-4">
                          <span className={cn(
                            'rounded-full border px-2 py-0.5 text-[9px] font-bold',
                            u.role === 'ADMIN' || u.role === 'SUPERADMIN'
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                              : 'border-white/10 bg-white/[0.04] text-zinc-400',
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-zinc-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 text-zinc-500">{u._count?.tasks ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
