import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  formatDuration,
  truncate,
  getInitials,
  slugify,
  formatNumber,
  formatBytes,
  getStatusColor,
  timeAgo,
} from '../utils';

describe('cn (classname merger)', () => {
  it('merges simple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('resolves tailwind conflicts — last one wins', () => {
    const result = cn('text-red-400', 'text-blue-400');
    expect(result).toBe('text-blue-400');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null, 'baz')).toBe('foo baz');
  });
});

describe('formatDuration', () => {
  it('returns "-" for undefined / null / 0 / negative', () => {
    expect(formatDuration(undefined)).toBe('-');
    expect(formatDuration(0)).toBe('-');
    expect(formatDuration(-100)).toBe('-');
  });

  it('formats seconds when under 1 minute', () => {
    expect(formatDuration(30_000)).toBe('30s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3_720_000)).toBe('1h 2m');
  });
});

describe('truncate', () => {
  it('returns empty string for falsy input', () => {
    expect(truncate('')).toBe('');
  });

  it('does not truncate when string is within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('appends ellipsis when string exceeds limit', () => {
    const result = truncate('hello world', 8);
    expect(result).toBe('hello wo...');
    expect(result.length).toBe(11);
  });

  it('uses default limit of 50', () => {
    const long = 'a'.repeat(60);
    expect(truncate(long)).toHaveLength(53); // 50 chars + '...'
  });
});

describe('getInitials', () => {
  it('returns "OP" for undefined / empty', () => {
    expect(getInitials()).toBe('OP');
    expect(getInitials('')).toBe('OP');
  });

  it('returns two-char prefix for single-word name', () => {
    expect(getInitials('Alice')).toBe('AL');
  });

  it('returns first + last initials for multi-word name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('handles extra whitespace', () => {
    expect(getInitials('  Ada  Lovelace  ')).toBe('AL');
  });
});

describe('slugify', () => {
  it('converts to lowercase with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces/hyphens', () => {
    expect(slugify('foo  --  bar')).toBe('foo-bar');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  -hello-  ')).toBe('hello');
  });
});

describe('formatNumber', () => {
  it('returns "0" for undefined/null', () => {
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(null as any)).toBe('0');
  });

  it('leaves small numbers unchanged', () => {
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatNumber(1_500)).toBe('1.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatNumber(2_000_000)).toBe('2.0M');
  });

  it('formats billions with B suffix', () => {
    expect(formatNumber(3_000_000_000)).toBe('3.0B');
  });
});

describe('formatBytes', () => {
  it('returns "0 B" for 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats kilobytes', () => {
    // parseFloat strips trailing zero: 1.0 => 1
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 ** 3)).toBe('1 GB');
  });

  it('keeps decimal places for non-exact values', () => {
    // 1536 bytes = 1.5 KB — parseFloat keeps the .5
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

describe('getStatusColor', () => {
  it('returns blue for RUNNING', () => {
    expect(getStatusColor('RUNNING')).toBe('text-blue-400');
    expect(getStatusColor('running')).toBe('text-blue-400');
  });

  it('returns emerald for COMPLETED / SUCCESS', () => {
    expect(getStatusColor('COMPLETED')).toBe('text-emerald-400');
    expect(getStatusColor('success')).toBe('text-emerald-400');
  });

  it('returns red for FAILED / ERROR', () => {
    expect(getStatusColor('FAILED')).toBe('text-red-400');
    expect(getStatusColor('error')).toBe('text-red-400');
  });

  it('returns yellow for QUEUED / PENDING', () => {
    expect(getStatusColor('QUEUED')).toBe('text-yellow-400');
    expect(getStatusColor('pending')).toBe('text-yellow-400');
  });

  it('returns zinc for unknown status', () => {
    expect(getStatusColor('UNKNOWN')).toBe('text-zinc-400');
  });
});

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "-" for undefined', () => {
    expect(timeAgo(undefined)).toBe('-');
  });

  it('returns "just now" for < 5 seconds ago', () => {
    const d = new Date('2026-06-29T11:59:57.000Z');
    expect(timeAgo(d)).toBe('just now');
  });

  it('returns seconds ago for < 60 seconds', () => {
    const d = new Date('2026-06-29T11:59:30.000Z');
    expect(timeAgo(d)).toBe('30s ago');
  });

  it('returns minutes ago for < 60 minutes', () => {
    const d = new Date('2026-06-29T11:55:00.000Z');
    expect(timeAgo(d)).toBe('5m ago');
  });

  it('returns hours ago for < 24 hours', () => {
    const d = new Date('2026-06-29T09:00:00.000Z');
    expect(timeAgo(d)).toBe('3h ago');
  });

  it('returns days ago for < 7 days', () => {
    const d = new Date('2026-06-26T12:00:00.000Z');
    expect(timeAgo(d)).toBe('3d ago');
  });
});
