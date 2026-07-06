'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Play,
  Search,
  Calendar,
  Clock,
  RefreshCw,
  Activity,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

interface ReplaySession {
  id: string;
  taskName: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalSteps: number;
  duration: number;
  startedAt: string;
  completedAt: string | null;
  summary: string;
}

const MOCK_SESSIONS: ReplaySession[] = Array.from({ length: 20 }, (_, i) => {
  const names = [
    'E-commerce Product Catalog Scrape',
    'API Documentation Generator',
    'Database Schema Migration v4.0',
    'Weekly Infrastructure Cost Analysis',
    'Authentication Middleware Refactor',
    'CI/CD Pipeline Optimization',
    'Data Warehouse ETL Pipeline',
    'Code Review Automation Setup',
    'Performance Benchmark Suite',
    'Security Audit Report Generation',
    'Email Campaign Template Builder',
    'Log Aggregation Pipeline',
    'GraphQL Schema Federation',
    'Container Orchestration Update',
    'Load Testing Framework',
    'Monitoring Dashboard Config',
    'Search Index Rebuild',
    'Secrets Rotation Workflow',
    'Backup Verification Suite',
    'DNS Migration Script',
  ];
  const statuses: ReplaySession['status'][] = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'FAILED', 'CANCELLED', 'COMPLETED'];
  const startedAt = new Date(Date.now() - i * 86400000 * (1 + Math.random() * 3));
  const duration = 60000 + Math.floor(Math.random() * 600000);
  const totalSteps = 5 + Math.floor(Math.random() * 25);
  return {
    id: `ses_${(i + 1).toString().padStart(4, '0')}`,
    taskName: names[i] ?? 'Untitled Session',
    status: statuses[i % statuses.length],
    totalSteps,
    duration,
    startedAt: startedAt.toISOString(),
    completedAt: new Date(startedAt.getTime() + duration).toISOString(),
    summary: [
      'Automated data extraction with parallel request throttling and retry logic.',
      'Generated OpenAPI 3.1 spec from TypeScript types with JSDoc annotations.',
      'Migrated PostgreSQL schema across 12 tables with zero-downtime strategy.',
      'Analyzed multi-cloud spending patterns across AWS, GCP, and Azure.',
      'Refactored Next.js middleware to support role-based access control.',
      'Optimized build pipeline reducing CI time from 18m to 6m 30s.',
      'Extracted, transformed, and loaded 2.3M records into data warehouse.',
      'Configured automated PR review with custom ESLint and SonarQube rules.',
      'Executed benchmark suite across 3 environments — 97th percentile latency.',
      'Generated SOC 2 compliance report with automated evidence collection.',
      'Built responsive email template with dynamic content blocks and preview.',
      'Centralized log streaming from 24 microservices to Elasticsearch cluster.',
      'Unified 4 GraphQL services into federated schema with Apollo Gateway.',
      'Updated Kubernetes manifests for 0-downtime rolling deployment strategy.',
      'Orchestrated distributed load test with 10k virtual users across 5 regions.',
      'Configured Grafana dashboards with alerting rules for 18 service metrics.',
      'Rebuilt Typesense search index with updated tokenizer and ranking rules.',
      'Rotated 47 service account keys across production and staging environments.',
      'Validated 312 backup snapshots with integrity checks and restore tests.',
      'Executed multi-region DNS cutover with 12s propagation delay and monitoring.',
    ][i] ?? 'Session replay with execution trace data.',
  };
});

const STATUS_META = {
  COMPLETED: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  FAILED: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  CANCELLED: { label: 'Cancelled', color: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' },
};

function fmtDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export default function ReplayPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReplaySession['status'] | 'all'>('all');

  const filtered = useMemo(() => {
    return MOCK_SESSIONS.filter((s) => {
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchSearch =
        !search ||
        s.taskName.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [search, statusFilter]);

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs text-red-300">
            <Play className="h-3.5 w-3.5" />
            Session Replay
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Session Replay Browser</h1>
          <p className="mt-1 text-zinc-400">
            Browse completed agent sessions and replay their execution traces.
          </p>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* FILTERS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
          <Filter className="h-3 w-3 text-zinc-600 ml-2" />
          {(['all', 'COMPLETED', 'FAILED', 'CANCELLED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all',
                statusFilter === s
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {s === 'all' ? 'All' : STATUS_META[s]?.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="h-9 w-52 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:outline-none"
          />
        </div>
      </div>

      {/* SESSION LIST */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((s, i) => {
            const meta = STATUS_META[s.status];
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => router.push(`/execution/replay/${s.id}`)}
                className="group relative cursor-pointer rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.03]"
              >
                <div className="flex items-start gap-4">
                  {/* PLAY BUTTON */}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-red-500/10 text-red-400 group-hover:bg-red-500/20 transition-all">
                    <Play className="h-5 w-5 ml-0.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-base font-bold text-white truncate">{s.taskName}</h3>
                      <span className={cn('rounded px-2 py-0.5 text-[9px] font-bold uppercase', meta.bg, meta.color, meta.border, 'border')}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 mb-3">
                      {s.summary}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(s.startedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDuration(s.duration)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {s.totalSteps} steps
                      </span>
                      <span className="font-mono">{s.id}</span>
                    </div>
                  </div>

                  <div className="flex-shrink-0 self-center">
                    <ArrowRight className="h-5 w-5 text-zinc-700 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-400" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.06] bg-black/20 py-20 text-center">
          <Play className="mb-4 h-10 w-10 text-zinc-700" />
          <p className="text-sm font-semibold text-zinc-500">No sessions found</p>
          <p className="mt-1 text-xs text-zinc-600">Complete a task to see replayable sessions here.</p>
        </div>
      )}
    </div>
    </Suspense></ErrorBoundary>
  );
}
