import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/* ===========================================================
   CLASSNAME MERGER
=========================================================== */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ===========================================================
   DATES & TIME
=========================================================== */

export function formatDate(value?: string | Date) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDateShort(value?: string | Date) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function formatTime(value?: string | Date) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

/**
 * Returns a humanized "time ago" string e.g. "2m ago", "3h ago"
 */
export function timeAgo(value?: string | Date): string {
  if (!value) return '-';
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(value);
}

/**
 * Format milliseconds into human readable duration (1m 23s)
 */
export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/* ===========================================================
   STRINGS
=========================================================== */

export function truncate(value: string, length = 50) {
  if (!value) return '';
  if (value.length <= length) return value;
  return `${value.slice(0, length)}...`;
}

export function getInitials(name?: string): string {
  if (!name) return 'OP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ===========================================================
   NUMBERS
=========================================================== */

/**
 * Convert big numbers to short form: 1.2K, 3.4M
 */
export function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '0';
  if (num < 1000) return num.toString();
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}K`;
  if (num < 1_000_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  return `${(num / 1_000_000_000).toFixed(1)}B`;
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/* ===========================================================
   ASYNC
=========================================================== */

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay = 300,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/* ===========================================================
   IDS
=========================================================== */

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ===========================================================
   STATUS HELPERS
=========================================================== */

export function getStatusColor(status: string): string {
  const s = status?.toUpperCase();
  if (s === 'RUNNING') return 'text-blue-400';
  if (s === 'COMPLETED' || s === 'SUCCESS') return 'text-emerald-400';
  if (s === 'FAILED' || s === 'ERROR') return 'text-red-400';
  if (s === 'QUEUED' || s === 'PENDING') return 'text-yellow-400';
  if (s === 'PAUSED') return 'text-orange-400';
  return 'text-zinc-400';
}

/* ===========================================================
   COPY TO CLIPBOARD
=========================================================== */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}