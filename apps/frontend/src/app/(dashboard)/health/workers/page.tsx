'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { motion } from 'framer-motion';
import {
  HardDrive, Activity, CheckCircle2, XCircle,
  Loader2, Gauge, Cpu, MemoryStick,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkerData {
  name: string;
  activeJobs: number;
  idleWorkers: number;
  failedJobs: number;
  completedJobs: number;
  failureRate: number;
  memoryMb: number;
  cpuPercent: number;
  uptimeSec: number;
}

interface WorkersHealth {
  workers: WorkerData[];
}

const MOCK: WorkersHealth = {
  workers: [
    { name: 'task-executor', activeJobs: 6, idleWorkers: 4, failedJobs: 42, completedJobs: 14_200, failureRate: 0.3, memoryMb: 186, cpuPercent: 45, uptimeSec: 345_600 },
    { name: 'step-processor', activeJobs: 3, idleWorkers: 7, failedJobs: 156, completedJobs: 98_400, failureRate: 0.16, memoryMb: 124, cpuPercent: 28, uptimeSec: 345_600 },
    { name: 'email-sender', activeJobs: 2, idleWorkers: 3, failedJobs: 8, completedJobs: 45_100, failureRate: 0.02, memoryMb: 92, cpuPercent: 18, uptimeSec: 259_200 },
    { name: 'notification-worker', activeJobs: 5, idleWorkers: 5, failedJobs: 23, completedJobs: 209_800, failureRate: 0.01, memoryMb: 78, cpuPercent: 22, uptimeSec: 259_200 },
    { name: 'webhook-relay', activeJobs: 1, idleWorkers: 4, failedJobs: 67, completedJobs: 67_700, failureRate: 0.1, memoryMb: 56, cpuPercent: 12, uptimeSec: 172_800 },
  ],
};

function WorkerBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? value / max : 0;
  return (
    <div className="h-2 flex-1 rounded-full bg-white/[0.04] overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', color)}
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}

function MiniGauge({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.min(value / max, 1);
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" fill="none" stroke="white" strokeOpacity={0.05} strokeWidth="4" />
          <motion.circle
            cx="32" cy="32" r="26" fill="none" stroke={color}
            strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 26}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 26 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 26 * (1 - pct) }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <span className="font-mono text-xs font-black text-white">{Math.round(pct * 100)}%</span>
      </div>
      <p className="mt-1 text-[9px] text-zinc-500">{label}</p>
    </div>
  );
}

export default function WorkersHealthPage() {
  const { workers } = MOCK;
  const totalActive = workers.reduce((a, w) => a + w.activeJobs, 0);
  const totalIdle = workers.reduce((a, w) => a + w.idleWorkers, 0);
  const totalCompleted = workers.reduce((a, w) => a + w.completedJobs, 0);
  const totalFailed = workers.reduce((a, w) => a + w.failedJobs, 0);
  const maxActive = Math.max(...workers.map((w) => w.activeJobs));

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <HardDrive className="h-3.5 w-3.5 text-red-400" />
          Worker Health
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">Workers</h1>
        <p className="mt-1 text-sm text-zinc-500">BullMQ worker status, job throughput, and resource usage.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Active Jobs', value: String(totalActive), icon: Loader2, color: 'text-red-400' },
          { label: 'Idle Workers', value: String(totalIdle), icon: Activity, color: 'text-emerald-400' },
          { label: 'Completed', value: totalCompleted.toLocaleString(), icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Failed', value: totalFailed.toLocaleString(), icon: XCircle, color: totalFailed > 0 ? 'text-red-400' : 'text-zinc-400' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
            >
              <Icon className={cn('h-5 w-5', stat.color)} />
              <p className={cn('mt-3 font-mono text-2xl font-black', stat.color)}>{stat.value}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{stat.label}</p>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-bold text-white">Worker Status</h2>
        </div>
        <div className="space-y-4">
          {workers.map((w, i) => {
            const failPct = w.failureRate;
            return (
              <motion.div
                key={w.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-zinc-500" />
                    <span className="text-xs font-semibold text-white">{w.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[11px] text-zinc-400">{w.activeJobs} active</span>
                    <span className="font-mono text-[11px] text-zinc-400">{w.idleWorkers} idle</span>
                    <span className={cn('font-mono text-[11px]', failPct > 0.1 ? 'text-red-400' : 'text-zinc-400')}>
                      {failPct}% fail
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <WorkerBar value={w.activeJobs} max={maxActive} color="bg-red-500" />
                  <WorkerBar value={w.idleWorkers} max={maxActive} color="bg-emerald-500" />
                </div>
                <div className="mt-1 flex gap-4 text-[10px] text-zinc-600">
                  <span>{w.completedJobs.toLocaleString()} completed</span>
                  {w.failedJobs > 0 && <span className="text-red-400">{w.failedJobs} failed</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Worker CPU Usage</h2>
          </div>
          <div className="space-y-3">
            {workers.map((w, i) => {
              const maxCpu = Math.max(...workers.map((x) => x.cpuPercent));
              return (
                <div key={w.name} className="flex items-center gap-3">
                  <span className="w-28 text-[11px] text-zinc-400 truncate">{w.name}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-white/[0.04] overflow-hidden relative">
                    <motion.div
                      className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/30 to-red-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(w.cpuPercent / maxCpu) * 100}%` }}
                      transition={{ duration: 1, delay: i * 0.08, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-[11px] text-zinc-400">{w.cpuPercent}%</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <MemoryStick className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Worker Memory Usage</h2>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {workers.map((w, _i) => (
              <MiniGauge key={w.name} value={w.memoryMb} max={512} label={w.name.split('-')[0]} color="#ef4444" />
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">Total memory across workers</span>
              <span className="font-mono text-sm font-bold text-white">
                {workers.reduce((a, w) => a + w.memoryMb, 0)} MB
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
