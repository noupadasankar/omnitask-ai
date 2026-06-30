import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  calculatePercentageChange,
  getTrendDirection,
  formatDuration,
  calculateSuccessRate,
  calculateAverageTime,
  calculateRollingAverage,
  calculatePercentile,
  getStatusColor,
  truncateText,
  safeJsonParse,
  calculateMemoryUsagePercent,
  formatBytes,
  sortBy,
  filterBy,
  aggregateBy,
  getTimeRangeLabel,
} from '../dashboardUtils';

describe('formatNumber (dashboardUtils)', () => {
  it('returns "0" for zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats thousands', () => {
    expect(formatNumber(1_234_567)).toBe('1.2M');
  });

  it('formats billions', () => {
    expect(formatNumber(2_000_000_000)).toBe('2.0B');
  });
});

describe('calculatePercentageChange', () => {
  it('handles zero previous value — positive current → 100%', () => {
    expect(calculatePercentageChange(50, 0)).toBe(100);
  });

  it('handles zero previous and zero current → 0%', () => {
    expect(calculatePercentageChange(0, 0)).toBe(0);
  });

  it('calculates increase correctly', () => {
    expect(calculatePercentageChange(110, 100)).toBeCloseTo(10);
  });

  it('calculates decrease correctly', () => {
    expect(calculatePercentageChange(80, 100)).toBeCloseTo(-20);
  });
});

describe('getTrendDirection', () => {
  it('returns "neutral" for change < 1', () => {
    expect(getTrendDirection(0.5)).toBe('neutral');
    expect(getTrendDirection(-0.9)).toBe('neutral');
  });

  it('returns "up" for positive change >= 1', () => {
    expect(getTrendDirection(5)).toBe('up');
  });

  it('returns "down" for negative change <= -1', () => {
    expect(getTrendDirection(-3)).toBe('down');
  });
});

describe('formatDuration (dashboardUtils)', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3661)).toBe('1h 1m');
  });
});

describe('calculateSuccessRate', () => {
  it('returns 0 when total is 0', () => {
    expect(calculateSuccessRate(0, 0)).toBe(0);
  });

  it('calculates correctly', () => {
    expect(calculateSuccessRate(8, 2)).toBe(80);
  });

  it('returns 100 when no failures', () => {
    expect(calculateSuccessRate(10, 0)).toBe(100);
  });
});

describe('calculateAverageTime', () => {
  it('returns 0 for empty array', () => {
    expect(calculateAverageTime([])).toBe(0);
  });

  it('averages correctly', () => {
    expect(calculateAverageTime([10, 20, 30])).toBe(20);
  });
});

describe('calculateRollingAverage', () => {
  it('handles single-element window', () => {
    expect(calculateRollingAverage([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('averages over window size', () => {
    const result = calculateRollingAverage([2, 4, 6], 2);
    expect(result[0]).toBe(2);     // only [2]
    expect(result[1]).toBe(3);     // avg(2,4)
    expect(result[2]).toBe(5);     // avg(4,6)
  });
});

describe('calculatePercentile', () => {
  it('returns 0 for empty array', () => {
    expect(calculatePercentile([], 50)).toBe(0);
  });

  it('returns median correctly', () => {
    expect(calculatePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('returns min at 0th percentile', () => {
    expect(calculatePercentile([10, 20, 30], 0)).toBe(10);
  });

  it('returns max at 100th percentile', () => {
    expect(calculatePercentile([10, 20, 30], 100)).toBe(30);
  });
});

describe('getStatusColor (dashboardUtils)', () => {
  it('returns green hex for completed', () => {
    expect(getStatusColor('completed')).toBe('#10b981');
  });

  it('returns blue hex for running', () => {
    expect(getStatusColor('running')).toBe('#3b82f6');
  });

  it('returns fallback for unknown status', () => {
    expect(getStatusColor('whatever')).toBe('#94a3b8');
  });
});

describe('truncateText', () => {
  it('returns full text when within limit', () => {
    expect(truncateText('short', 10)).toBe('short');
  });

  it('truncates and appends ellipsis', () => {
    expect(truncateText('hello world', 8)).toBe('hello...');
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not-json', 42)).toBe(42);
  });
});

describe('calculateMemoryUsagePercent', () => {
  it('returns 0 when total is 0', () => {
    expect(calculateMemoryUsagePercent(500, 0)).toBe(0);
  });

  it('calculates percentage correctly', () => {
    expect(calculateMemoryUsagePercent(256, 1024)).toBeCloseTo(25);
  });
});

describe('formatBytes (dashboardUtils)', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('formats kilobytes (parseFloat strips trailing zeros)', () => {
    // parseFloat('1.00') === 1, so the output is '1 KB' not '1.00 KB'
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('keeps significant decimals for non-exact values', () => {
    // 1536 = 1.50 KB -> parseFloat gives 1.5
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

describe('getTimeRangeLabel', () => {
  it('returns correct label for each range', () => {
    expect(getTimeRangeLabel('hour')).toBe('Last Hour');
    expect(getTimeRangeLabel('day')).toBe('Last 24 Hours');
    expect(getTimeRangeLabel('week')).toBe('Last 7 Days');
    expect(getTimeRangeLabel('month')).toBe('Last 30 Days');
  });
});

describe('sortBy', () => {
  const data = [{ v: 3 }, { v: 1 }, { v: 2 }];

  it('sorts ascending by default', () => {
    expect(sortBy(data, 'v').map((x) => x.v)).toEqual([1, 2, 3]);
  });

  it('sorts descending', () => {
    expect(sortBy(data, 'v', 'desc').map((x) => x.v)).toEqual([3, 2, 1]);
  });

  it('does not mutate the original array', () => {
    const original = [...data];
    sortBy(data, 'v');
    expect(data).toEqual(original);
  });
});

describe('filterBy', () => {
  const items = [
    { status: 'active', type: 'A' },
    { status: 'inactive', type: 'A' },
    { status: 'active', type: 'B' },
  ];

  it('filters by single property', () => {
    expect(filterBy(items, { status: 'active' })).toHaveLength(2);
  });

  it('filters by multiple properties', () => {
    expect(filterBy(items, { status: 'active', type: 'B' })).toHaveLength(1);
  });

  it('supports function conditions', () => {
    const result = filterBy(items, { status: (v: string) => v.startsWith('in') });
    expect(result).toHaveLength(1);
  });
});

describe('aggregateBy', () => {
  const data = [
    { group: 'a', val: 10 },
    { group: 'a', val: 20 },
    { group: 'b', val: 5 },
  ];

  it('sums by group', () => {
    const result = aggregateBy(data, 'group', 'val', 'sum');
    expect(result['a']).toBe(30);
    expect(result['b']).toBe(5);
  });

  it('averages by group', () => {
    const result = aggregateBy(data, 'group', 'val', 'avg');
    expect(result['a']).toBe(15);
  });

  it('counts by group', () => {
    const result = aggregateBy(data, 'group', 'val', 'count');
    expect(result['a']).toBe(2);
    expect(result['b']).toBe(1);
  });
});
