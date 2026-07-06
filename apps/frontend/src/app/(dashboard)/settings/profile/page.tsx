'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  User, Mail, Shield, Save, Loader2, CheckCircle2, AlertTriangle, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/services/api';

export default function ProfilePage() {
  const { user, setUser } = useAuth();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    if (password && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: Record<string, string> = {};
      if (name && name !== user.name) payload.name = name;
      if (password) payload.password = password;
      if (Object.keys(payload).length === 0) {
        setError('No changes to save');
        setSaving(false);
        return;
      }
      const { data } = await api.put(`/users/${user.id}`, payload);
      setUser({ ...user, name: data.name ?? user.name });
      setPassword('');
      setConfirmPassword('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const roleBadge =
    user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
      : 'border-blue-500/20 bg-blue-500/10 text-blue-400';

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <User className="h-3.5 w-3.5 text-red-400" />
          Account
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Profile</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your name, password and account details.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl"
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-3xl font-black text-red-400">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-base font-bold text-white">{user?.name || 'Anonymous'}</p>
              <p className="mt-1 text-xs text-zinc-500">{user?.email}</p>
            </div>
            <span className={cn('rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider', roleBadge)}>
              {user?.role ?? 'USER'}
            </span>
          </div>
          <div className="mt-6 space-y-2 border-t border-white/[0.05] pt-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{user?.email}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Shield className="h-3.5 w-3.5" />
              <span>{user?.role ?? 'USER'} account</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl lg:col-span-2"
        >
          <h2 className="mb-5 text-sm font-bold text-white">Edit Profile</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Email Address</label>
              <div className="flex h-10 items-center rounded-xl border border-white/[0.04] bg-white/[0.01] px-3">
                <span className="text-sm text-zinc-600">{user?.email}</span>
                <span className="ml-auto text-[10px] text-zinc-700">Read-only</span>
              </div>
            </div>

            <div className="border-t border-white/[0.05] pt-4">
              <div className="mb-3 flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-xs font-semibold text-zinc-400">Change Password</span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-500">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-500">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">Profile saved successfully</p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
