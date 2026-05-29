'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Play,
  Copy,
  Trash2,
  Eye,
  Layout,
  GitBranch,
  RefreshCw,
  Filter,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/* ===========================================================
   MOCK WORKFLOW DATA
=========================================================== */

const WORKFLOWS = [
  {
    id: 'wf-001',
    name: 'E-commerce Price Monitor',
    description: 'Scrape competitor pricing every 6 hours and alert on changes > 10%',
    status: 'active',
    executions: 47,
    lastRun: '2 hours ago',
    version: 3,
    author: 'System',
    category: 'automation',
  },
  {
    id: 'wf-002',
    name: 'Lead Qualification Pipeline',
    description: 'Fetch leads from CRM, enrich with data, score and prioritize',
    status: 'active',
    executions: 128,
    lastRun: '30 min ago',
    version: 2,
    author: 'Admin',
    category: 'sales',
  },
  {
    id: 'wf-003',
    name: 'Weekly Report Generator',
    description: 'Aggregate task metrics, generate insights, send to Slack',
    status: 'paused',
    executions: 12,
    lastRun: '1 week ago',
    version: 1,
    author: 'Admin',
    category: 'reporting',
  },
  {
    id: 'wf-004',
    name: 'Content Auto-Publisher',
    description: 'Research topics, write drafts, publish to blog and social',
    status: 'draft',
    executions: 0,
    lastRun: '—',
    version: 0,
    author: 'Writer',
    category: 'content',
  },
];

const TEMPLATES = [
  {
    id: 'tpl-001',
    name: 'Web Scraper',
    icon: '🕷️',
    description: 'Scrape any website and export to CSV',
    complexity: 'easy',
  },
  {
    id: 'tpl-002',
    name: 'Email Workflow',
    icon: '📧',
    description: 'Send, track, and follow up on emails',
    complexity: 'easy',
  },
  {
    id: 'tpl-003',
    name: 'Data Pipeline',
    icon: '📊',
    description: 'ETL pipeline with validation',
    complexity: 'medium',
  },
  {
    id: 'tpl-004',
    name: 'Multi-Agent Orchestration',
    icon: '🤖',
    description: 'Chain multiple AI agents together',
    complexity: 'advanced',
  },
];

/* ===========================================================
   COMPONENT
=========================================================== */

export default function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<'workflows' | 'templates'>('workflows');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWorkflows = WORKFLOWS.filter((wf) =>
    wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wf.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Workflow Engine
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Design, deploy, and monitor autonomous AI workflows
          </p>
        </div>

        <button className="flex h-10 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white hover:bg-red-400 transition-all shadow-lg shadow-red-500/20">
          <Plus className="h-4 w-4" />
          New Workflow
        </button>
      </div>

      {/* ================================================= */}
      {/* TABS */}
      {/* ================================================= */}
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl">
        <button
          onClick={() => setActiveTab('workflows')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
            activeTab === 'workflows'
              ? 'bg-red-500/10 text-red-400'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          <Layout className="h-4 w-4" />
          My Workflows
          <span className="text-xs opacity-60">
            ({WORKFLOWS.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
            activeTab === 'templates'
              ? 'bg-red-500/10 text-red-400'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          <GitBranch className="h-4 w-4" />
          Templates
        </button>
      </div>

      {/* ================================================= */}
      {/* SEARCH + FILTER */}
      {/* ================================================= */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workflows..."
            className="w-full h-10 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:bg-white/[0.04] focus:outline-none transition-all"
          />
        </div>

        <button className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* ================================================= */}
      {/* WORKFLOWS TAB */}
      {/* ================================================= */}
      {activeTab === 'workflows' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredWorkflows.map((wf, i) => (
            <motion.div
              key={wf.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => setSelectedWorkflow(wf.id)}
              className={cn(
                'group relative cursor-pointer overflow-hidden rounded-[24px] border bg-black/30 p-5 backdrop-blur-xl transition-all duration-300',
                selectedWorkflow === wf.id
                  ? 'border-red-500/30 shadow-lg shadow-red-500/10'
                  : 'border-white/[0.07] hover:border-white/15',
              )}
            >
              {/* Top status bar */}
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                    wf.status === 'active'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : wf.status === 'paused'
                        ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
                        : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-500',
                  )}
                >
                  {wf.status.toUpperCase()}
                </span>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-white">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="mb-3">
                <h3 className="text-[14px] font-semibold text-white">
                  {wf.name}
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500 line-clamp-2">
                  {wf.description}
                </p>
              </div>

              {/* Footer stats */}
              <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <Play className="h-3 w-3" />
                  <span>v{wf.version} · {wf.executions} runs</span>
                </div>

                <span className="text-[10px] text-zinc-600">
                  {wf.lastRun}
                </span>
              </div>

              {/* Run button on hover */}
              {wf.status === 'active' && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition-all"
                >
                  <Play className="h-3 w-3" />
                  Run Now
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ================================================= */}
      {/* TEMPLATES TAB */}
      {/* ================================================= */}
      {activeTab === 'templates' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((tpl, i) => (
            <motion.div
              key={tpl.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all duration-300 hover:border-white/15"
            >
              {/* Icon */}
              <div className="mb-3 text-3xl">{tpl.icon}</div>

              {/* Title */}
              <h3 className="text-[13px] font-semibold text-white">
                {tpl.name}
              </h3>

              {/* Description */}
              <p className="mt-1 text-[11px] text-zinc-500">
                {tpl.description}
              </p>

              {/* Complexity */}
              <div className="mt-3">
                <span
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-wider',
                    tpl.complexity === 'easy'
                      ? 'text-emerald-400'
                      : tpl.complexity === 'medium'
                        ? 'text-yellow-400'
                        : 'text-red-400',
                  )}
                >
                  {tpl.complexity}
                </span>
              </div>

              {/* Use Template button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-red-400 transition-all shadow-lg shadow-red-500/20"
              >
                <Plus className="h-3 w-3" />
                Use Template
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}