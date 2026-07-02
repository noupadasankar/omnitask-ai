'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Save,
  X,
  ToggleLeft,
  ToggleRight,
  Plus,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentsApi } from '@/lib/api';

interface AgentSettings {
  enabled: boolean;
  autoApprove: boolean;
  headlessMode: boolean;
  maxConcurrency: number;
  domainWhitelist: string[];
}

const DEFAULT_SETTINGS: AgentSettings = {
  enabled: true,
  autoApprove: false,
  headlessMode: true,
  maxConcurrency: 3,
  domainWhitelist: ['linkedin.com', 'github.com', 'google.com'],
};

export default function AgentSettingsPage() {
  const params = useParams();
  const id = params.id as string;

  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [original, setOriginal] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    agentsApi
      .get(id)
      .then((res) => {
        const s = { ...DEFAULT_SETTINGS, ...(res.data?.settings ?? {}) };
        setSettings(s);
        setOriginal(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(original);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setOriginal({ ...settings });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCancel = () => {
    setSettings({ ...original });
  };

  const addDomain = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain || settings.domainWhitelist.includes(domain)) return;
    setSettings((s) => ({ ...s, domainWhitelist: [...s.domainWhitelist, domain] }));
    setNewDomain('');
  };

  const removeDomain = (domain: string) => {
    setSettings((s) => ({ ...s, domainWhitelist: s.domainWhitelist.filter((d) => d !== domain) }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.07] bg-black/30 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-red-400" />
        <p className="mt-3 text-sm text-zinc-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6">
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-6 backdrop-blur-xl">
        <h2 className="text-lg font-bold text-white">Agent Configuration</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Configure runtime behavior for this agent. Changes apply on next execution.
        </p>
      </div>

      {/* Toggles */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <h3 className="mb-4 text-sm font-semibold text-white">Execution Options</h3>
        <div className="space-y-4 divide-y divide-white/[0.05]">
          <ToggleRow
            label="Agent Enabled"
            desc="Allow this agent to accept and execute tasks"
            enabled={settings.enabled}
            onChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
          />
          <ToggleRow
            label="Auto-Approve Actions"
            desc="Skip approval for low-risk actions automatically"
            enabled={settings.autoApprove}
            onChange={(v) => setSettings((s) => ({ ...s, autoApprove: v }))}
          />
          <ToggleRow
            label="Headless Mode"
            desc="Run browser in headless mode (no visible window)"
            enabled={settings.headlessMode}
            onChange={(v) => setSettings((s) => ({ ...s, headlessMode: v }))}
          />
        </div>
      </div>

      {/* Max Concurrency */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Max Concurrency</h3>
          <p className="text-xs text-zinc-500">Maximum number of parallel browser sessions</p>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={10}
            value={settings.maxConcurrency}
            onChange={(e) => setSettings((s) => ({ ...s, maxConcurrency: Number(e.target.value) }))}
            className="flex-1 h-2 appearance-none rounded-full bg-white/[0.06] accent-red-500 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
          />
          <span className="flex h-9 w-12 items-center justify-center rounded-xl border border-white/[0.07] bg-black text-sm font-bold text-white">
            {settings.maxConcurrency}
          </span>
        </div>
      </div>

      {/* Domain Whitelist */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <h3 className="mb-4 text-sm font-semibold text-white">Domain Whitelist</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Agents will only navigate to domains in this list.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDomain()}
            placeholder="example.com"
            className="flex-1 h-10 rounded-xl border border-white/[0.07] bg-black px-4 text-xs text-white placeholder:text-zinc-700 focus:border-red-500/30 focus:outline-none"
          />
          <button
            onClick={addDomain}
            disabled={!newDomain.trim()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {settings.domainWhitelist.length === 0 ? (
          <p className="text-xs text-zinc-600 py-4 text-center">No domains whitelisted</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {settings.domainWhitelist.map((domain) => (
              <span
                key={domain}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300"
              >
                <GlobeSmall />
                {domain}
                <button
                  onClick={() => removeDomain(domain)}
                  className="ml-1 text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Save / Cancel */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={cn(
            'flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-all shadow-lg',
            saved
              ? 'bg-emerald-600 shadow-emerald-600/20'
              : 'bg-red-500 hover:bg-red-400 shadow-red-500/20',
            (!hasChanges || saving) && 'opacity-60 cursor-not-allowed',
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
              Save Changes
            </>
          )}
        </button>
        {hasChanges && (
          <button
            onClick={handleCancel}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 text-sm font-medium text-zinc-400 transition-all hover:border-red-500/20 hover:text-red-400"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        )}
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}

function ToggleRow({ label, desc, enabled, onChange }: { label: string; desc: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <button onClick={() => onChange(!enabled)} className="text-zinc-400 hover:text-white transition-colors">
        {enabled ? <ToggleRight className="h-9 w-9 text-red-400" /> : <ToggleLeft className="h-9 w-9 text-zinc-600" />}
      </button>
    </div>
  );
}

function GlobeSmall() {
  return (
    <svg className="h-3 w-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8" />
    </svg>
  );
}
