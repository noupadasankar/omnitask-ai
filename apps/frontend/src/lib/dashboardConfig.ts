// Dashboard theme and configuration

export const DASHBOARD_CONFIG = {
  // Animation durations (ms)
  ANIMATION: {
    FAST: 200,
    NORMAL: 300,
    SLOW: 500,
    SLOW_CHART: 1000,
  },

  // Refresh intervals (ms)
  REFRESH: {
    METRICS: 5000,
    ANALYTICS: 30000,
    HEALTH: 10000,
    MEMORY: 60000,
  },

  // Chart configuration
  CHART: {
    HEIGHT: {
      SMALL: 200,
      MEDIUM: 300,
      LARGE: 400,
    },
    MARGIN: {
      top: 20,
      right: 30,
      bottom: 20,
      left: 60,
    },
  },

  // Grid configuration
  GRID: {
    MOBILE: 1,
    TABLET: 2,
    DESKTOP: 3,
    ULTRA_WIDE: 4,
  },
};

// Color scheme
export const COLORS = {
  // Status colors
  SUCCESS: '#10b981',
  ERROR: '#ef4444',
  WARNING: '#f59e0b',
  INFO: '#3b82f6',
  SECONDARY: '#8b5cf6',

  // Neutral colors
  NEUTRAL: {
    950: '#030712',
    900: '#0f172a',
    800: '#1e293b',
    700: '#334155',
    600: '#475569',
    500: '#64748b',
    400: '#94a3b8',
    300: '#cbd5e1',
    200: '#e2e8f0',
  },

  // Chart colors
  CHART: {
    PRIMARY: '#3b82f6',
    SECONDARY: '#10b981',
    TERTIARY: '#f59e0b',
    QUATERNARY: '#8b5cf6',
    ERROR: '#ef4444',
  },

  // Gradients
  GRADIENT: {
    SUCCESS: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    ERROR: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    INFO: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    PURPLE: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    WARM: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
};

// Status badges
export const STATUS_CONFIG = {
  TASK: {
    QUEUED: { bg: '#3b82f6', text: '#dbeafe', label: 'Queued' },
    PLANNING: { bg: '#f59e0b', text: '#fef3c7', label: 'Planning' },
    RUNNING: { bg: '#10b981', text: '#d1fae5', label: 'Running' },
    PAUSED: { bg: '#8b5cf6', text: '#ede9fe', label: 'Paused' },
    COMPLETED: { bg: '#059669', text: '#d1fae5', label: 'Completed' },
    FAILED: { bg: '#dc2626', text: '#fee2e2', label: 'Failed' },
    CANCELLED: { bg: '#6b7280', text: '#f3f4f6', label: 'Cancelled' },
  },
  AGENT: {
    ACTIVE: { bg: '#10b981', text: '#d1fae5', label: 'Active' },
    IDLE: { bg: '#64748b', text: '#f1f5f9', label: 'Idle' },
    ERROR: { bg: '#ef4444', text: '#fee2e2', label: 'Error' },
  },
  HEALTH: {
    GOOD: { bg: '#10b981', text: '#d1fae5' },
    WARNING: { bg: '#f59e0b', text: '#fef3c7' },
    CRITICAL: { bg: '#ef4444', text: '#fee2e2' },
  },
};

// Metric thresholds
export const THRESHOLDS = {
  SUCCESS_RATE: {
    EXCELLENT: 95,
    GOOD: 90,
    ACCEPTABLE: 80,
    POOR: 0,
  },
  EXECUTION_TIME: {
    FAST: 1000,
    NORMAL: 5000,
    SLOW: 10000,
    VERY_SLOW: Infinity,
  },
  ERROR_RATE: {
    EXCELLENT: 1,
    GOOD: 2,
    ACCEPTABLE: 5,
    POOR: Infinity,
  },
};

// Time range presets
export const TIME_RANGES = {
  HOUR: { label: 'Last Hour', value: 'hour', ms: 60 * 60 * 1000 },
  DAY: { label: 'Last 24 Hours', value: 'day', ms: 24 * 60 * 60 * 1000 },
  WEEK: { label: 'Last 7 Days', value: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  MONTH: { label: 'Last 30 Days', value: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
};

// Chart type defaults
export const CHART_DEFAULTS = {
  AREA: {
    strokeWidth: 2,
    fillOpacity: 0.1,
    isAnimationActive: true,
  },
  BAR: {
    radius: 8,
    fillOpacity: 0.8,
    isAnimationActive: true,
  },
  LINE: {
    strokeWidth: 2,
    dot: { fill: '#fff', r: 4 },
    isAnimationActive: true,
  },
  PIE: {
    innerRadius: 0,
    outerRadius: 100,
    isAnimationActive: true,
  },
};

// Legend configuration
export const LEGEND_CONFIG = {
  wrapperStyle: {
    paddingTop: '20px',
  },
  iconType: 'line' as const,
  textStyle: {
    color: '#cbd5e1',
  },
};

// Tooltip configuration
export const TOOLTIP_CONFIG = {
  contentStyle: {
    backgroundColor: '#1e293b',
    border: '1px solid #475569',
    borderRadius: '8px',
    color: '#e2e8f0',
  },
  labelStyle: {
    color: '#e2e8f0',
  },
};

// Responsive breakpoints
export const BREAKPOINTS = {
  XS: 320,
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  '2XL': 1536,
};

// Default pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [5, 10, 25, 50, 100],
};

// Sort options
export const SORT_OPTIONS = {
  ASC: 'asc',
  DESC: 'desc',
};

// Export helper functions
export const getStatusColor = (status: string): string => {
  const statusKey = status.toUpperCase();
  const config = STATUS_CONFIG.TASK as Record<string, any>;
  return config[statusKey]?.bg || COLORS.NEUTRAL[500];
};

export const getStatusLabel = (status: string): string => {
  const statusKey = status.toUpperCase();
  const config = STATUS_CONFIG.TASK as Record<string, any>;
  return config[statusKey]?.label || status;
};

export const getHealthStatus = (value: number, type: 'success' | 'error' | 'response' = 'success'): 'good' | 'warning' | 'critical' => {
  const thresholds = type === 'success'
    ? THRESHOLDS.SUCCESS_RATE
    : type === 'error'
    ? THRESHOLDS.ERROR_RATE
    : THRESHOLDS.EXECUTION_TIME;

  if (value >= thresholds.EXCELLENT) return 'good';
  if (value >= thresholds.GOOD) return 'warning';
  return 'critical';
};
