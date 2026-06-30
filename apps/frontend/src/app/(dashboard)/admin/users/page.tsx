'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, RefreshCw, Loader2, Lock,
  Search, ChevronDown, AlertTriangle, CheckCircle2, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/services/api';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

const ROLES = ['USER', 'ADMIN', 'SUPERADMIN'];

export default function AdminUsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const isSuperAdmin = user?.role === 'SUPERADMIN';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(0);
  const take = 20;

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ skip: String(page * take), take: String(take) });
      if (roleFilter) params.set('role', roleFilter);
      const res = await api.get(`/admin/users?${params}`);
      const raw = res.data;
      setUsers(raw.data ?? raw.users ?? (Array.isArray(raw) ? raw : []));
      setTotal(raw.total ?? 0);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isAdmin, page, roleFilter]);

  const changeRole = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      setSuccess(`Role updated to ${newRole}`);
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to update role');
      setTimeout(() => setError(null), 4000);
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete ${email}? This soft-deletes the account and cannot be undone easily.`)) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setSuccess('User deleted');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to delete user');
      setTimeout(() => setError(null), 4000);
    }
  };

  const filtered = users.filter(u =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

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
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            <Shield className="h-3.5 w-3.5" />
            Admin · User Management
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Users</h1>
          <p className="mt-1 text-sm text-zinc-500">{total} total accounts registered</p>
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

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-4 text-sm text-white placeholder-zinc-600 outline-none focus:border-white/20" />
        </div>
        <div className="relative">
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}
            className="h-10 appearance-none rounded-xl border border-white/[0.07] bg-zinc-900 px-4 pr-8 text-sm text-zinc-300 outline-none focus:border-white/20">
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-red-400" />
            <span className="ml-3 text-sm text-zinc-500">Loading users…</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.05] text-left">
                  {['Name', 'Email', 'Role', 'Verified', 'Joined', isSuperAdmin ? 'Actions' : ''].filter(Boolean).map(h => (
                    <th key={h} className="pb-3 pr-4 font-semibold text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(u => (
                  <tr key={u.id} className={cn('transition-colors hover:bg-white/[0.02]', u.id === user?.id && 'bg-amber-500/[0.02]')}>
                    <td className="py-3 pr-4 font-semibold text-white">
                      {u.name || '—'}
                      {u.id === user?.id && <span className="ml-2 text-[9px] text-amber-400 font-bold">(you)</span>}
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">{u.email}</td>
                    <td className="py-3 pr-4">
                      {isSuperAdmin && u.id !== user?.id ? (
                        <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                          className={cn(
                            'rounded-lg border px-2 py-1 text-[10px] font-bold outline-none cursor-pointer bg-zinc-900',
                            u.role === 'SUPERADMIN' || u.role === 'ADMIN'
                              ? 'border-amber-500/20 text-amber-400'
                              : 'border-white/10 text-zinc-400'
                          )}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span className={cn(
                          'rounded-full border px-2 py-0.5 text-[9px] font-bold',
                          u.role === 'ADMIN' || u.role === 'SUPERADMIN'
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                            : 'border-white/10 bg-white/[0.04] text-zinc-400',
                        )}>{u.role}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={cn('text-[10px] font-semibold', u.emailVerified ? 'text-emerald-400' : 'text-zinc-600')}>
                        {u.emailVerified ? '✓ Verified' : '✗ Pending'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                    {isSuperAdmin && (
                      <td className="py-3">
                        {u.id !== user?.id && (
                          <button onClick={() => deleteUser(u.id, u.email)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-500/50 hover:bg-red-500/10 hover:text-red-400 transition-all">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && !loading && (
              <p className="py-10 text-center text-sm text-zinc-600">No users found.</p>
            )}
          </div>
        )}

        {total > take && (
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-4">
            <p className="text-xs text-zinc-600">
              Showing {page * take + 1}–{Math.min((page + 1) * take, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="h-8 px-3 rounded-lg border border-white/[0.07] text-xs text-zinc-400 hover:bg-white/[0.05] disabled:opacity-30">Prev</button>
              <button disabled={(page + 1) * take >= total} onClick={() => setPage(p => p + 1)}
                className="h-8 px-3 rounded-lg border border-white/[0.07] text-xs text-zinc-400 hover:bg-white/[0.05] disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
