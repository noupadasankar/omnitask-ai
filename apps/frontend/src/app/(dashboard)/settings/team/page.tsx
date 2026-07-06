'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Mail,
  Trash2,
  Shield,
  ShieldCheck,
  ShieldHalf,
  Eye,
  Loader2,
  X,
  Clock,
} from 'lucide-react';
type Role = 'Owner' | 'Admin' | 'Member' | 'Viewer';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  joinedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  sentAt: string;
}

const ROLES: { value: Role; icon: any; desc: string }[] = [
  { value: 'Owner', icon: ShieldCheck, desc: 'Full access to all settings and billing' },
  { value: 'Admin', icon: Shield, desc: 'Manage agents, permissions, and team' },
  { value: 'Member', icon: ShieldHalf, desc: 'Execute tasks and view history' },
  { value: 'Viewer', icon: Eye, desc: 'Read-only access to dashboard' },
];

const MOCK_MEMBERS: TeamMember[] = [
  { id: '1', name: 'You', email: 'admin@omnitask.ai', role: 'Owner', joinedAt: '2026-01-15' },
  { id: '2', name: 'Alice Chen', email: 'alice@example.com', role: 'Admin', joinedAt: '2026-02-20' },
  { id: '3', name: 'Bob Martinez', email: 'bob@example.com', role: 'Member', joinedAt: '2026-03-10' },
  { id: '4', name: 'Diana Park', email: 'diana@example.com', role: 'Viewer', joinedAt: '2026-04-05' },
];

const MOCK_INVITATIONS: Invitation[] = [
  { id: 'inv_1', email: 'carol@example.com', role: 'Member', sentAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'inv_2', email: 'eve@example.com', role: 'Admin', sentAt: new Date(Date.now() - 172800000).toISOString() },
];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TeamSettingsPage() {
  const [members, setMembers] = useState(MOCK_MEMBERS);
  const [invitations, setInvitations] = useState(MOCK_INVITATIONS);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Member');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    await new Promise((r) => setTimeout(r, 800));
    setInvitations((prev) => [
      ...prev,
      { id: `inv_${Date.now()}`, email: inviteEmail.trim(), role: inviteRole, sentAt: new Date().toISOString() },
    ]);
    setInviteEmail('');
    setInviting(false);
  };

  const handleRemove = async (memberId: string) => {
    setRemoving(memberId);
    await new Promise((r) => setTimeout(r, 500));
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    setRemoving(null);
  };

  const handleRevokeInvite = async (invId: string) => {
    setInvitations((prev) => prev.filter((i) => i.id !== invId));
  };

  const handleRoleChange = (memberId: string, newRole: Role) => {
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
  };

  const currentUser = members[0];

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">Team Management</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage team members, roles, and invitations.
        </p>
      </div>

      {/* Team Members */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Team Members</h2>
          </div>
          <span className="text-[10px] text-zinc-600">{members.length} members</span>
        </div>

        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-xs font-bold text-red-400">
                  {getInitials(member.name)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">
                    {member.name}
                    {member.id === currentUser.id && <span className="ml-1.5 text-[10px] text-zinc-600">(you)</span>}
                  </p>
                  <p className="text-[10px] text-zinc-500">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                  disabled={member.id === currentUser.id}
                  className="h-8 rounded-lg border border-white/[0.07] bg-black px-2 text-[10px] text-white focus:border-red-500/30 focus:outline-none disabled:opacity-60"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value} disabled={r.value === 'Owner' && member.id !== currentUser.id}>
                      {r.value}
                    </option>
                  ))}
                </select>

                {member.id !== currentUser.id && (
                  <button
                    onClick={() => handleRemove(member.id)}
                    disabled={removing === member.id}
                    className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 transition-all"
                  >
                    {removing === member.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Member */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <UserPlus className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Invite Member</h2>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="colleague@example.com"
              className="h-10 w-full rounded-xl border border-white/[0.07] bg-black pl-10 pr-4 text-xs text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
            />
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="h-10 rounded-xl border border-white/[0.07] bg-black px-3 text-xs text-white focus:border-red-500/30 focus:outline-none"
          >
            {ROLES.filter((r) => r.value !== 'Owner').map((r) => (
              <option key={r.value} value={r.value}>{r.value}</option>
            ))}
          </select>
          <button
            onClick={handleInvite}
            disabled={!inviteEmail.trim() || inviting}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-red-500 px-4 text-xs font-semibold text-white transition-all hover:bg-red-400 disabled:opacity-50"
          >
            {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Invite
          </button>
        </div>
      </div>

      {/* Pending Invitations */}
      <AnimatePresence>
        {invitations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-yellow-400" />
              <h2 className="text-sm font-semibold text-white">Pending Invitations</h2>
              <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                {invitations.length}
              </span>
            </div>

            <div className="space-y-2">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-500/10">
                      <Mail className="h-4 w-4 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{inv.email}</p>
                      <p className="text-[10px] text-zinc-500">Role: {inv.role} &middot; Sent {new Date(inv.sentAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Roles Reference */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <h2 className="mb-4 text-sm font-semibold text-white">Role Descriptions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.value} className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                <Icon className="h-4 w-4 text-red-400 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-white">{r.value}</p>
                  <p className="text-[10px] text-zinc-500">{r.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
