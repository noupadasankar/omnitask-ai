'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Key, Copy, CheckCircle2, Terminal, Lock, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 text-[10px] font-semibold text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-white"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function ApiKeysPage() {
  const { user } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '';
  const baseUrl = 'http://localhost:4000/api';

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <Key className="h-3.5 w-3.5 text-red-400" />
          Developer
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">API Keys</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Authenticate requests to the OmniTask backend via your JWT access token.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Session Bearer Token</h2>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">ACTIVE</span>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-black/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <code className="break-all font-mono text-[11px] leading-relaxed text-zinc-400">
              {token ? `${token.slice(0, 48)}…` : 'No active session'}
            </code>
            {token && <CopyButton text={token} />}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-zinc-600">
          This token expires in 15 minutes. The frontend automatically refreshes it using your refresh token.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl"
      >
        <div className="mb-5 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-bold text-white">Quick Start</h2>
        </div>
        <div className="space-y-4">
          {[
            {
              label: 'Get execution history',
              cmd: `curl -H "Authorization: Bearer <token>" \\\n  ${baseUrl}/agent/history`,
            },
            {
              label: 'Get agent registry',
              cmd: `curl -H "Authorization: Bearer <token>" \\\n  ${baseUrl}/agent/registry`,
            },
            {
              label: 'Start a task',
              cmd: `curl -X POST -H "Authorization: Bearer <token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"goal":"Order a pizza","mode":"approval_required"}' \\\n  ${baseUrl}/agent/start`,
            },
          ].map((item, i) => (
            <div key={i}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-zinc-500">{item.label}</span>
                <CopyButton text={item.cmd} />
              </div>
              <pre className="overflow-x-auto rounded-xl border border-white/[0.05] bg-black/50 p-4 font-mono text-[11px] text-zinc-400">
                {item.cmd}
              </pre>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-bold text-white">Account Info</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: 'User ID',  value: user?.id ?? '—'    },
            { label: 'Email',    value: user?.email ?? '—' },
            { label: 'Role',     value: user?.role ?? '—'  },
            { label: 'API Base', value: baseUrl             },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
              <span className="text-xs text-zinc-500">{label}</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs text-zinc-300">{value}</code>
                <CopyButton text={value} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-dashed border-white/[0.07] bg-black/10 p-6"
      >
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-zinc-600" />
          <div>
            <p className="text-sm font-semibold text-zinc-400">Long-lived API Keys</p>
            <p className="mt-0.5 text-xs text-zinc-600">
              Permanent API keys for CI/CD and automation integrations are coming in a future update.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
