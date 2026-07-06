'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Calendar,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, timeAgo, formatDate } from '@/lib/utils';

type ExportFormat = 'JSON' | 'CSV' | 'PDF';
type ExportStatus = 'COMPLETED' | 'PROCESSING' | 'FAILED' | 'PENDING';

interface ExportRequest {
  id: string;
  format: ExportFormat;
  status: ExportStatus;
  dateRange: { start: string; end: string };
  requestedAt: string;
  completedAt: string | null;
  fileSize: string | null;
  downloadUrl: string | null;
}

const FORMAT_META: Record<ExportFormat, { icon: any; color: string; bg: string }> = {
  JSON: { icon: FileJson, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  CSV: { icon: FileSpreadsheet, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  PDF: { icon: FileText, color: 'text-red-400', bg: 'bg-red-500/10' },
};

const STATUS_META: Record<ExportStatus, { icon: any; color: string; bg: string; label: string }> = {
  COMPLETED: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Completed' },
  PROCESSING: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Processing' },
  FAILED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
  PENDING: { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Pending' },
};

const MOCK_EXPORTS: ExportRequest[] = Array.from({ length: 24 }, (_, i) => {
  const formats: ExportFormat[] = ['JSON', 'CSV', 'PDF'];
  const statuses: ExportStatus[] = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'PROCESSING', 'FAILED', 'COMPLETED', 'COMPLETED', 'PENDING'];
  const startDate = new Date(Date.now() - i * 86400000 * (2 + Math.random() * 5));
  const endDate = new Date(startDate.getTime() + 86400000 * (1 + Math.floor(Math.random() * 7)));
  const isDone = statuses[i % statuses.length] === 'COMPLETED';
  return {
    id: `exp_${(i + 1).toString().padStart(4, '0')}`,
    format: formats[i % 3],
    status: statuses[i % statuses.length],
    dateRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    requestedAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
    completedAt: isDone ? new Date(Date.now() - i * 86400000 * 2 + 300000).toISOString() : null,
    fileSize: isDone ? `${(Math.random() * 15 + 0.5).toFixed(1)} MB` : null,
    downloadUrl: isDone ? `https://api.omnitask.ai/exports/${`exp_${(i + 1).toString().padStart(4, '0')}`}/download` : null,
  };
});

const ITEMS_PER_PAGE = 8;

export default function ExportsPage() {
  const [page, setPage] = useState(1);
  const [filterFormat, setFilterFormat] = useState<ExportFormat | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ExportStatus | 'all'>('all');

  const filtered = useMemo(() => {
    return MOCK_EXPORTS.filter((e) => {
      const matchFormat = filterFormat === 'all' || e.format === filterFormat;
      const matchStatus = filterStatus === 'all' || e.status === filterStatus;
      return matchFormat && matchStatus;
    });
  }, [filterFormat, filterStatus]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const formats: (ExportFormat | 'all')[] = ['all', 'JSON', 'CSV', 'PDF'];
  const statuses: (ExportStatus | 'all')[] = ['all', 'COMPLETED', 'PROCESSING', 'PENDING', 'FAILED'];

  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs text-red-300">
            <Download className="h-3.5 w-3.5" />
            Data Portability
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Data Exports</h1>
          <p className="mt-1 text-zinc-400">
            Request and download historical session data in multiple formats.
          </p>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-xl bg-red-500/20 px-5 text-sm font-semibold text-red-300 border border-red-500/20 hover:bg-red-500/30 transition-all">
          <Plus className="h-4 w-4" />
          New Export
        </button>
      </div>

      {/* FILTERS */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Format</span>
            <div className="flex gap-1 rounded-lg border border-white/[0.05] bg-black/40 p-1">
              {formats.map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilterFormat(f); setPage(1); }}
                  className={cn(
                    'rounded px-2.5 py-1 text-[10px] font-semibold transition-all',
                    filterFormat === f
                      ? 'bg-red-500/10 text-red-400'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {f === 'all' ? 'All' : f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Status</span>
            <div className="flex gap-1 rounded-lg border border-white/[0.05] bg-black/40 p-1">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilterStatus(s); setPage(1); }}
                  className={cn(
                    'rounded px-2.5 py-1 text-[10px] font-semibold transition-all',
                    filterStatus === s
                      ? 'bg-red-500/10 text-red-400'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {s === 'all' ? 'All' : STATUS_META[s]?.label ?? s}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:ml-auto text-xs text-zinc-600">
            {filtered.length} export{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* EXPORT LIST */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="space-y-2">
          {paginated.length > 0 ? (
            paginated.map((exp, i) => {
              const fmtMeta = FORMAT_META[exp.format];
              const stMeta = STATUS_META[exp.status];
              const StatusIcon = stMeta.icon;
              const FormatIcon = fmtMeta.icon;
              const startStr = formatDate(exp.dateRange.start);
              const endStr = formatDate(exp.dateRange.end);

              return (
                <motion.div
                  key={exp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="group flex items-start gap-4 rounded-2xl border border-white/[0.05] bg-black/20 p-4 transition-all hover:border-white/[0.08]"
                >
                  <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', fmtMeta.bg, fmtMeta.color)}>
                    <FormatIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white font-mono">{exp.id}</h3>
                      <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold flex items-center gap-1', stMeta.bg, stMeta.color)}>
                        <StatusIcon className={cn('h-2.5 w-2.5', exp.status === 'PROCESSING' && 'animate-spin')} />
                        {stMeta.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {startStr} — {endStr}
                      </span>
                      <span>{exp.fileSize ?? '—'}</span>
                      <span>Requested {timeAgo(exp.requestedAt)}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {exp.status === 'COMPLETED' && exp.downloadUrl && (
                      <a
                        href={exp.downloadUrl}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 text-[10px] font-bold text-emerald-400 border border-emerald-500/10 hover:bg-emerald-500/20 transition-all"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                    )}
                    {exp.status === 'FAILED' && (
                      <span className="text-[10px] text-red-500">Retry</span>
                    )}
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/[0.05] rounded-2xl">
              <Download className="h-8 w-8 text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-500 font-semibold">No exports found</p>
              <p className="text-xs text-zinc-600 mt-1">Adjust filters or request a new export.</p>
            </div>
          )}
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.05]">
            <span className="text-[10px] text-zinc-600">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.05] text-zinc-500 hover:text-white hover:bg-white/[0.03] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold transition-all',
                    page === p
                      ? 'bg-red-500/10 text-red-400'
                      : 'text-zinc-600 hover:text-zinc-300',
                  )}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.05] text-zinc-500 hover:text-white hover:bg-white/[0.03] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
