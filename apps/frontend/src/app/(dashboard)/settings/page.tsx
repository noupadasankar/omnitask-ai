'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Shield,
  Bot,
  Bell,
  Globe,
  Key,
  Webhook,
  Mail,
  Database,
  Cpu,
  Clock,
  RefreshCw,
  Save,
  Check,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Sliders,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'agent' | 'keys' | 'security'>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // States for Settings variables
  const [theme, setTheme] = useState('dark');
  const [notifications, setNotifications] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gpt-4o');
  const [maxSteps, setMaxSteps] = useState(40);
  const [timeout, setTimeoutVal] = useState(600);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [openAIKey, setOpenAIKey] = useState(process.env.OPENAI_API_KEY);
  const [slackWebhook, setSlackWebhook] = useState(process.env.SLACK_WEBHOOK_URL);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 1200);
  };

  const tabs = [
    { id: 'general', label: 'General Settings', icon: Globe },
    { id: 'agent', label: 'Agent Configuration', icon: Bot },
    { id: 'keys', label: 'API Integrations', icon: Key },
    { id: 'security', label: 'Security & Policies', icon: Shield },
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
          <h1 className="text-3xl font-black tracking-tight text-white">
            System Configuration
          </h1>
          <p className="mt-1 text-zinc-400">
            Configure system parameters, agent execution limits, API connections, and credentials.
          </p>
        </div>

        <div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-all shadow-lg',
              saveSuccess
                ? 'bg-emerald-600 shadow-emerald-600/20'
                : 'bg-red-500 hover:bg-red-400 shadow-red-500/20',
              isSaving && 'opacity-60 cursor-not-allowed'
            )}
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="h-4 w-4" />
                Saved Successfully
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>

      {/* SETTINGS CONTENT GRID */}
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        {/* SIDEBAR TABS */}
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
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
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
                  <p className="text-xs text-zinc-500 mt-1">Global settings for dashboard appearance and alerts</p>
                </div>

                <div className="space-y-4 divide-y divide-white/[0.05]">
                  {/* Theme Select */}
                  <div className="flex items-center justify-between py-4 first:pt-0">
                    <div>
                      <p className="text-sm font-semibold text-white">Interface Theme</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Choose light or dark aesthetic mode</p>
                    </div>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="h-10 px-4 rounded-xl border border-white/[0.07] bg-black text-xs text-white focus:outline-none focus:border-red-500/30"
                    >
                      <option value="dark">Pure Dark Theme (Recommended)</option>
                      <option value="light">Light Mode</option>
                    </select>
                  </div>

                  {/* System Notifications Toggle */}
                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">System Notifications</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Receive browser alerts for task updates</p>
                    </div>
                    <button
                      onClick={() => setNotifications(!notifications)}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      {notifications ? (
                        <ToggleRight className="h-9 w-9 text-red-400" />
                      ) : (
                        <ToggleLeft className="h-9 w-9 text-zinc-600" />
                      )}
                    </button>
                  </div>

                  {/* Default Workspace */}
                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Default Workspace Context</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Active scope for newly initialized tasks</p>
                    </div>
                    <input
                      type="text"
                      defaultValue="omnitask-ai"
                      className="h-10 px-4 w-64 rounded-xl border border-white/[0.07] bg-black text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500/30"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'agent' && (
              <motion.div
                key="agent"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">Agent Settings</h2>
                  <p className="text-xs text-zinc-500 mt-1">Configure automation levels and engine resource consumption</p>
                </div>

                <div className="space-y-4 divide-y divide-white/[0.05]">
                  {/* Default Engine Model */}
                  <div className="flex items-center justify-between py-4 first:pt-0">
                    <div>
                      <p className="text-sm font-semibold text-white">Default Planner Model</p>
                      <p className="text-xs text-zinc-500 mt-0.5">LLM powering the task planning and orchestration layer</p>
                    </div>
                    <select
                      value={defaultModel}
                      onChange={(e) => setDefaultModel(e.target.value)}
                      className="h-10 px-4 rounded-xl border border-white/[0.07] bg-black text-xs text-white focus:outline-none focus:border-red-500/30"
                    >
                      <option value="gpt-4o">GPT-4o (High Intelligence)</option>
                      <option value="claude-3-5">Claude 3.5 Sonnet</option>
                      <option value="gemini-1-5">Gemini 1.5 Pro</option>
                      <option value="llama-3">Local LLaMA 3 (Self-Hosted)</option>
                    </select>
                  </div>

                  {/* Auto Approve Toggle */}
                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Auto-approve execution plans</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Skip manual confirmation for non-destructive steps</p>
                    </div>
                    <button
                      onClick={() => setAutoApprove(!autoApprove)}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      {autoApprove ? (
                        <ToggleRight className="h-9 w-9 text-red-400" />
                      ) : (
                        <ToggleLeft className="h-9 w-9 text-zinc-600" />
                      )}
                    </button>
                  </div>

                  {/* Max Steps Slider */}
                  <div className="py-4">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Maximum Agent Steps</p>
                        <p className="text-xs text-zinc-500">Cap execution length to prevent infinite loops</p>
                      </div>
                      <span className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded-md font-mono border border-red-500/15">
                        {maxSteps} steps
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={maxSteps}
                      onChange={(e) => setMaxSteps(Number(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                  </div>

                  {/* Timeout Limit */}
                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Agent Execution Timeout</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Total timeout duration in seconds per run</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={timeout}
                        onChange={(e) => setTimeoutVal(Number(e.target.value))}
                        className="h-10 px-4 w-28 rounded-xl border border-white/[0.07] bg-black text-xs text-white focus:outline-none focus:border-red-500/30"
                      />
                      <span className="text-xs text-zinc-500">seconds</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'keys' && (
              <motion.div
                key="keys"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">API Integrations</h2>
                  <p className="text-xs text-zinc-500 mt-1">Configure credentials, tokens, and webhooks for external tools</p>
                </div>

                <div className="space-y-4">
                  {/* OpenAI Key */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-white">OpenAI API Key</label>
                      <button
                        onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                        className="text-xs text-zinc-500 hover:text-white transition-colors"
                      >
                        {showOpenAIKey ? 'Hide' : 'Reveal'}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showOpenAIKey ? 'text' : 'password'}
                        value={openAIKey}
                        onChange={(e) => setOpenAIKey(e.target.value)}
                        className="w-full h-10 px-4 pr-10 rounded-xl border border-white/[0.07] bg-black text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500/30"
                      />
                      <Key className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                    </div>
                    <p className="text-[10px] text-zinc-500">Used for LLM analysis, search ranking, and planner routes.</p>
                  </div>

                  {/* Slack Webhook */}
                  <div className="space-y-2 pt-2">
                    <label className="text-sm font-semibold text-white">Slack Webhook URL</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={slackWebhook}
                        onChange={(e) => setSlackWebhook(e.target.value)}
                        className="w-full h-10 px-4 pr-10 rounded-xl border border-white/[0.07] bg-black text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500/30"
                      />
                      <Webhook className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                    </div>
                    <p className="text-[10px] text-zinc-500">Receives runtime messages, screenshot reports and alerts.</p>
                  </div>

                  {/* S3 Storage bucket */}
                  <div className="grid gap-4 md:grid-cols-2 pt-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-white">AWS S3 Bucket Name</label>
                      <input
                        type="text"
                        defaultValue="omnitask-screenshots"
                        className="w-full h-10 px-4 rounded-xl border border-white/[0.07] bg-black text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-white">S3 Region</label>
                      <input
                        type="text"
                        defaultValue="us-east-1"
                        className="w-full h-10 px-4 rounded-xl border border-white/[0.07] bg-black text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500/30"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">Security & Policies</h2>
                  <p className="text-xs text-zinc-500 mt-1">Control access scopes, rate limits, and network execution parameters</p>
                </div>

                <div className="space-y-4 divide-y divide-white/[0.05]">
                  {/* CORS Policies */}
                  <div className="flex items-center justify-between py-4 first:pt-0">
                    <div>
                      <p className="text-sm font-semibold text-white">Allowed Domain Web origins</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Restrict browser execution permissions to specified domains</p>
                    </div>
                    <input
                      type="text"
                      defaultValue="http://localhost:3000, *.omnitask.ai"
                      className="h-10 px-4 w-64 rounded-xl border border-white/[0.07] bg-black text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500/30"
                    />
                  </div>

                  {/* Sandboxed Toggles */}
                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Strict Sandbox Mode</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Isolate page executions completely within sandboxed chrome frames</p>
                    </div>
                    <button className="text-zinc-400 hover:text-white transition-colors">
                      <ToggleRight className="h-9 w-9 text-red-400" />
                    </button>
                  </div>

                  {/* Rate Limits */}
                  <div className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Maximum concurrent tasks per user</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Cap resource load from single operators</p>
                    </div>
                    <select className="h-10 px-4 rounded-xl border border-white/[0.07] bg-black text-xs text-white focus:outline-none focus:border-red-500/30">
                      <option value="5">5 active tasks</option>
                      <option value="10">10 active tasks</option>
                      <option value="20">20 active tasks</option>
                      <option value="unlimited">Unlimited tasks</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
