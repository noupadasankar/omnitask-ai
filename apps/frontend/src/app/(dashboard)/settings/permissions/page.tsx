'use client';

import { useState } from 'react';
import {
  Shield,
  Globe,
  MousePointerClick,
  Keyboard,
  Send,
  Upload,
  Save,
  CheckCircle2,
  Loader2,
  X,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ActionPolicy = 'allow_all' | 'ask_for_risky' | 'deny_all';
type DomainPolicy = 'ALLOW' | 'ASK' | 'DENY';

interface DomainRule {
  domain: string;
  policy: DomainPolicy;
}

const ACTIONS = [
  { id: 'browse', label: 'Browse', icon: Globe, desc: 'Navigate to web pages and follow links' },
  { id: 'click', label: 'Click', icon: MousePointerClick, desc: 'Click on buttons, links, and elements' },
  { id: 'type', label: 'Type', icon: Keyboard, desc: 'Input text into form fields' },
  { id: 'submit', label: 'Submit', icon: Send, desc: 'Submit forms and send data' },
  { id: 'upload', label: 'Upload', icon: Upload, desc: 'Upload files and attachments' },
];

export default function PermissionsSettingsPage() {
  const [defaultPolicy, setDefaultPolicy] = useState<ActionPolicy>('ask_for_risky');
  const [actionPermissions, setActionPermissions] = useState<Record<string, boolean>>({
    browse: true,
    click: true,
    type: true,
    submit: false,
    upload: false,
  });
  const [domainRules, setDomainRules] = useState<DomainRule[]>([
    { domain: 'linkedin.com', policy: 'ALLOW' },
    { domain: 'github.com', policy: 'ALLOW' },
    { domain: 'mail.google.com', policy: 'ASK' },
    { domain: 'banking.example.com', policy: 'DENY' },
  ]);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addRule = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain || domainRules.some((r) => r.domain === domain)) return;
    setDomainRules((prev) => [...prev, { domain, policy: 'ASK' }]);
    setNewDomain('');
  };

  const removeRule = (domain: string) => {
    setDomainRules((prev) => prev.filter((r) => r.domain !== domain));
  };

  const updateRulePolicy = (domain: string, policy: DomainPolicy) => {
    setDomainRules((prev) => prev.map((r) => r.domain === domain ? { ...r, policy } : r));
  };

  const POLICY_STYLES: Record<DomainPolicy, { bg: string; border: string; text: string }> = {
    ALLOW: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    ASK: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400' },
    DENY: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">Permissions</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Control what your agents can do and where they can go.
        </p>
      </div>

      {/* Default Action Policy */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <Shield className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Default Action Policy</h2>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Determines how agents handle actions not explicitly covered by domain rules.
        </p>
        <div className="flex gap-3">
          {(['allow_all', 'ask_for_risky', 'deny_all'] as ActionPolicy[]).map((policy) => (
            <button
              key={policy}
              onClick={() => setDefaultPolicy(policy)}
              className={cn(
                'flex flex-1 flex-col items-center rounded-xl border p-4 transition-all',
                defaultPolicy === policy
                  ? 'border-red-500/30 bg-red-500/[0.03]'
                  : 'border-white/[0.07] hover:border-white/15',
              )}
            >
              <span className={cn(
                'text-[11px] font-semibold',
                defaultPolicy === policy ? 'text-white' : 'text-zinc-500',
              )}>
                {policy === 'allow_all' ? 'Allow All' : policy === 'ask_for_risky' ? 'Ask for Risky' : 'Deny All'}
              </span>
              <p className="mt-1 text-[10px] text-zinc-500 text-center leading-relaxed">
                {policy === 'allow_all' ? 'Execute all actions automatically' : policy === 'ask_for_risky' ? 'Prompt for high-risk actions only' : 'Block all actions by default'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Action Permissions */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <MousePointerClick className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Action Permissions</h2>
        </div>
        <div className="space-y-1">
          {ACTIONS.map((action) => {
            const enabled = actionPermissions[action.id];
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', enabled ? 'bg-emerald-500/10' : 'bg-white/[0.03]')}>
                    <Icon className={cn('h-4 w-4', enabled ? 'text-emerald-400' : 'text-zinc-600')} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{action.label}</p>
                    <p className="text-[10px] text-zinc-500">{action.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => setActionPermissions((p) => ({ ...p, [action.id]: !enabled }))}
                  className={cn(
                    'relative h-6 w-10 rounded-full transition-colors',
                    enabled ? 'bg-emerald-500' : 'bg-white/[0.1]',
                  )}
                >
                  <div className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    enabled ? 'translate-x-[18px] left-0.5' : 'left-0.5',
                  )} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Domain Rules */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <Globe className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Domain-Specific Rules</h2>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Override the default policy for specific domains.
        </p>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRule()}
            placeholder="example.com"
            className="flex-1 h-10 rounded-xl border border-white/[0.07] bg-black px-4 text-xs text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
          />
          <button
            onClick={addRule}
            disabled={!newDomain.trim()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Domain
          </button>
        </div>

        {domainRules.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-600">No domain rules configured</p>
        ) : (
          <div className="space-y-2">
            {domainRules.map((rule) => {
              return (
                <div key={rule.domain} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-zinc-500" />
                    <span className="text-xs font-mono text-white">{rule.domain}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 rounded-lg border border-white/[0.05] p-0.5">
                      {(['ALLOW', 'ASK', 'DENY'] as DomainPolicy[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => updateRulePolicy(rule.domain, p)}
                          className={cn(
                            'rounded-md px-2 py-1 text-[10px] font-semibold transition-all',
                            rule.policy === p ? POLICY_STYLES[p].bg + ' ' + POLICY_STYLES[p].text : 'text-zinc-600 hover:text-zinc-400',
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => removeRule(rule.domain)} className="ml-1 text-zinc-600 hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          'flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-all shadow-lg',
          saved ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-red-500 hover:bg-red-400 shadow-red-500/20',
          saving && 'opacity-60 cursor-not-allowed',
        )}
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : saved ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Permissions
          </>
        )}
      </button>
    </div>
  );
}
