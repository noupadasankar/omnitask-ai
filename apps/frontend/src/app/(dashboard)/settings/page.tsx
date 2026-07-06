'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  Settings,
  Shield,
  Bot,
  Globe,
  Briefcase,
  UtensilsCrossed,
  ShoppingCart,
  Plane,
  RefreshCw,
  Save,
  Check,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDomainPreferences,
  useSavePreferences,
} from '@/hooks/useRuntimeData';
import type { UserDomainPreferences } from '@/services/agent.service';

const EMPTY_PREFS: UserDomainPreferences = {
  preferredJobSites: [],
  preferredFoodApps: [],
  preferredShoppingSites: [],
  preferredTravelSites: [],
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'preferences' | 'general' | 'security'>('preferences');
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);

  /* ── Agent domain preferences ── */
  const { data, isLoading } = useDomainPreferences();
  const saveMutation = useSavePreferences();
  const [prefs, setPrefs] = useState<UserDomainPreferences>(EMPTY_PREFS);

  useEffect(() => {
    if (data) {
      setPrefs({
        preferredJobSites: data.preferredJobSites ?? [],
        preferredFoodApps: data.preferredFoodApps ?? [],
        preferredShoppingSites: data.preferredShoppingSites ?? [],
        preferredTravelSites: data.preferredTravelSites ?? [],
      });
    }
  }, [data]);

  const handleSave = () => saveMutation.mutate(prefs);
  const saved = saveMutation.isSuccess && !saveMutation.isPending;

  /* ── Tabs ── */
  const tabs = [
    { id: 'preferences', label: 'Agent Preferences', icon: Bot },
    { id: 'general',     label: 'General Settings',  icon: Globe },
    { id: 'security',    label: 'Security & Policies', icon: Shield },
  ] as const;

  return (
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <Settings className="h-3.5 w-3.5" />
            Config Management
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">System Configuration</h1>
          <p className="mt-1 text-zinc-400">
            Configure agent domain preferences, appearance, and execution policies.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || activeTab !== 'preferences'}
          className={cn(
            'flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-all shadow-lg',
            saved ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-red-500 hover:bg-red-400 shadow-red-500/20',
            (saveMutation.isPending || activeTab !== 'preferences') && 'opacity-60 cursor-not-allowed',
          )}
          title={activeTab !== 'preferences' ? 'Switch to Agent Preferences to save' : 'Save preferences'}
        >
          {saveMutation.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving Changes...
            </>
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved Successfully
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Preferences
            </>
          )}
        </button>
      </div>

      {/* CONTENT */}
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        {/* TABS */}
        <div className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap lg:w-full',
                  active
                    ? 'bg-white/[0.05] border border-white/10 text-white'
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-red-400' : 'text-zinc-500')} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* FORMS */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
          <AnimatePresence mode="wait">

            {/* AGENT PREFERENCES */}
            {activeTab === 'preferences' && (
              <motion.div
                key="preferences"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">Agent Domain Preferences</h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Preferred sites the agent uses for each task domain. Saved to your account.
                  </p>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin text-red-400" />
                    <span className="ml-2 text-sm text-zinc-500">Loading preferences...</span>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <SiteListField
                      icon={Briefcase}
                      label="Preferred Job Sites"
                      hint="e.g. linkedin.com, indeed.com"
                      values={prefs.preferredJobSites}
                      onChange={(v) => setPrefs((p) => ({ ...p, preferredJobSites: v }))}
                    />
                    <SiteListField
                      icon={UtensilsCrossed}
                      label="Preferred Food Apps"
                      hint="e.g. ubereats.com, doordash.com"
                      values={prefs.preferredFoodApps}
                      onChange={(v) => setPrefs((p) => ({ ...p, preferredFoodApps: v }))}
                    />
                    <SiteListField
                      icon={ShoppingCart}
                      label="Preferred Shopping Sites"
                      hint="e.g. amazon.com, ebay.com"
                      values={prefs.preferredShoppingSites}
                      onChange={(v) => setPrefs((p) => ({ ...p, preferredShoppingSites: v }))}
                    />
                    <SiteListField
                      icon={Plane}
                      label="Preferred Travel Sites"
                      hint="e.g. booking.com, expedia.com"
                      values={prefs.preferredTravelSites}
                      onChange={(v) => setPrefs((p) => ({ ...p, preferredTravelSites: v }))}
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* GENERAL */}
            {activeTab === 'general' && (
              <motion.div
                key="general"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">General Parameters</h2>
                  <p className="text-xs text-zinc-500 mt-1">Dashboard appearance and alert settings</p>
                </div>

                <div className="space-y-4 divide-y divide-white/[0.05]">
                  <div className="flex items-center justify-between py-4 first:pt-0">
                    <div>
                      <p className="text-sm font-semibold text-white">Interface Theme</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Applied immediately and remembered on this device</p>
                    </div>
                    <select
                      value={theme ?? 'dark'}
                      onChange={(e) => setTheme(e.target.value)}
                      className="h-10 px-4 rounded-xl border border-white/[0.07] bg-black text-xs text-white focus:outline-none focus:border-red-500/30"
                    >
                      <option value="dark">Pure Dark Theme (Recommended)</option>
                      <option value="light">Light Mode</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">System Notifications</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Receive in-app alerts for task updates</p>
                    </div>
                    <button onClick={() => setNotifications(!notifications)} className="text-zinc-400 hover:text-white transition-colors">
                      {notifications ? (
                        <ToggleRight className="h-9 w-9 text-red-400" />
                      ) : (
                        <ToggleLeft className="h-9 w-9 text-zinc-600" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SECURITY */}
            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">Security &amp; Policies</h2>
                  <p className="text-xs text-zinc-500 mt-1">Runtime safety policy applied to agent executions</p>
                </div>

                <div className="space-y-4 divide-y divide-white/[0.05]">
                  <PolicyRow title="Human Approval Layer" desc="Sensitive actions pause for explicit operator clearance" enabled />
                  <PolicyRow title="Strict Sandbox Mode" desc="Browser executions run inside isolated Chromium frames" enabled />
                  <PolicyRow title="Audit Trail Logging" desc="Every agent action is recorded to the execution history" enabled />
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════════════════════════════════ */

function SiteListField({
  icon: Icon,
  label,
  hint,
  values,
  onChange,
}: {
  icon: any;
  label: string;
  hint: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="h-4 w-4 text-red-400" />
        {label}
      </label>
      <input
        type="text"
        value={values.join(', ')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder={hint}
        className="w-full h-10 px-4 rounded-xl border border-white/[0.07] bg-black text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500/30"
      />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {values.map((v) => (
            <span key={v} className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyRow({ title, desc, enabled }: { title: string; desc: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between py-4 first:pt-0">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <span
        className={cn(
          'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
          enabled
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
            : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
        )}
      >
        {enabled ? 'Enforced' : 'Off'}
      </span>
    </div>
  );
}
