// Dashboard utility functions for data formatting and transformation

/**
 * Format large numbers with appropriate units
 * @example formatNumber(1234567) => "1.2M"
 */
export const formatNumber = (num: number, decimals: number = 1): string => {
  if (num === 0) return '0';
  
  const units = ['', 'K', 'M', 'B', 'T'];
  const magnitude = Math.floor(Math.log10(Math.abs(num)) / 3);
  const scaled = num / Math.pow(1000, magnitude);
  
  return `${scaled.toFixed(decimals)}${units[magnitude]}`;
};

/**
 * Calculate percentage change between two values
 */
export const calculatePercentageChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Determine trend direction
 */
export const getTrendDirection = (change: number): 'up' | 'down' | 'neutral' => {
  if (Math.abs(change) < 1) return 'neutral';
  return change > 0 ? 'up' : 'down';
};

/**
 * Format duration in seconds to human-readable string
 * @example formatDuration(90) => "1m 30s"
 */
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

/**
 * Calculate success rate from completed and failed tasks
 */
export const calculateSuccessRate = (completed: number, failed: number): number => {
  const total = completed + failed;
  if (total === 0) return 0;
  return (completed / total) * 100;
};

/**
 * Calculate average execution time
 */
export const calculateAverageTime = (durations: number[]): number => {
  if (durations.length === 0) return 0;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
};

/**
 * Group data by time period
 */
export const groupByTimePeriod = (
  data: Array<{ timestamp: Date; [key: string]: any }>,
  period: 'hour' | 'day' | 'week' | 'month'
): Record<string, any[]> => {
  const grouped: Record<string, any[]> = {};

  data.forEach((item) => {
    let key: string;
    const date = new Date(item.timestamp);

    switch (period) {
      case 'hour':
        key = date.toISOString().slice(0, 13);
        break;
      case 'day':
        key = date.toISOString().slice(0, 10);
        break;
      case 'week':
        const week = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
        key = `week-${week}`;
        break;
      case 'month':
        key = date.toISOString().slice(0, 7);
        break;
    }

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  return grouped;
};

/**
 * Calculate rolling average
 */
export const calculateRollingAverage = (values: number[], windowSize: number): number[] => {
  const result: number[] = [];
  
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    const average = window.reduce((a, b) => a + b, 0) / window.length;
    result.push(average);
  }

  return result;
};

/**
 * Calculate percentile
 */
export const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

/**
 * Format timestamp for display
 */
export const formatTimestamp = (date: Date | string, format: 'short' | 'long' = 'short'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (format === 'short') {
    return d.toLocaleTimeString();
  }
  
  return d.toLocaleString();
};

/**
 * Get time range label
 */
export const getTimeRangeLabel = (range: 'hour' | 'day' | 'week' | 'month'): string => {
  const labels: Record<string, string> = {
    hour: 'Last Hour',
    day: 'Last 24 Hours',
    week: 'Last 7 Days',
    month: 'Last 30 Days',
  };
  return labels[range];
};

/**
 * Color mapping for status values
 */
export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    completed: '#10b981',
    running: '#3b82f6',
    pending: '#f59e0b',
    failed: '#ef4444',
    idle: '#64748b',
    active: '#10b981',
    error: '#ef4444',
  };
  return colors[status.toLowerCase()] || '#94a3b8';
};

/**
 * Truncate text to specified length
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

/**
 * Parse JSON safely
 */
export const safeJsonParse = <T = any>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

/**
 * Calculate memory usage percentage
 */
export const calculateMemoryUsagePercent = (used: number, total: number): number => {
  if (total === 0) return 0;
  return (used / total) * 100;
};

/**
 * Convert bytes to human-readable format
 */
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Sort array of objects by property
 */
export const sortBy = <T extends Record<string, any>>(
  array: T[],
  key: keyof T,
  order: 'asc' | 'desc' = 'asc'
): T[] => {
  return [...array].sort((a, b) => {
    if (a[key] < b[key]) return order === 'asc' ? -1 : 1;
    if (a[key] > b[key]) return order === 'asc' ? 1 : -1;
    return 0;
  });
};

/**
 * Filter array by multiple conditions
 */
export const filterBy = <T extends Record<string, any>>(
  array: T[],
  conditions: Record<string, any>
): T[] => {
  return array.filter((item) =>
    Object.entries(conditions).every(([key, value]) => {
      if (typeof value === 'function') return value(item[key]);
      return item[key] === value;
    })
  );
};

/**
 * Aggregate data by property
 */
export const aggregateBy = <T extends Record<string, any>>(
  array: T[],
  groupBy: keyof T,
  aggregateKey: keyof T,
  operation: 'sum' | 'avg' | 'count' = 'sum'
): Record<string, number> => {
  const grouped = array.reduce(
    (acc, item) => {
      const key = String(item[groupBy]);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item[aggregateKey]);
      return acc;
    },
    {} as Record<string, any[]>
  );

  const result: Record<string, number> = {};

  Object.entries(grouped).forEach(([key, values]) => {
    switch (operation) {
      case 'sum':
        result[key] = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        result[key] = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'count':
        result[key] = values.length;
        break;
    }
  });

  return result;
};
