export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    cursor?: string;
    hasMore?: boolean;
  };
}

export interface PaginatedRequest {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

export interface CreateTaskRequest {
  goal: string;
  taskType?: string;
}

export interface TaskResponse {
  id: string;
  goal: string;
  status: string;
  taskType?: string;
  riskLevel: string;
  plan?: Record<string, unknown>;
  result?: Record<string, unknown>;
  failureReason?: string;
  stepsCompleted?: number;
  totalSteps?: number;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: string;
  plan: string;
  createdAt: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  timestamp: string;
  services: {
    database: boolean;
    redis: boolean;
    queue: boolean;
  };
}
