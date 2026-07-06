import { api } from './api';

/* ===========================================================
   TYPES
=========================================================== */

export interface Task {
  id: string;
  title?: string;
  naturalLanguage: string;
  status: 'PENDING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  progress?: number;
  agent?: string;
  agents?: string[];
  duration?: string;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface CreateTaskPayload {
  naturalLanguage: string;
  mode?: string;
  priority?: string;
  metadata?: Record<string, unknown>;
}

/* ===========================================================
   SERVICE
=========================================================== */

export const taskService = {
  /**
   * Get all tasks (supports filtering)
   */
  async getTasks(params?: {
    status?: string;
    limit?: number;
    page?: number;
  }): Promise<Task[]> {
    const res = await api.get('/tasks', { params });
    return res.data;
  },

  /**
   * Get a single task by ID
   */
  async getTask(id: string): Promise<Task> {
    const res = await api.get(`/tasks/${id}`);
    return res.data;
  },

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskPayload): Promise<Task> {
    const res = await api.post('/tasks', data);
    return res.data;
  },

  /**
   * Update an existing task
   */
  async updateTask(
    id: string,
    data: Partial<Pick<Task, 'status' | 'priority' | 'title'>>,
  ): Promise<Task> {
    const res = await api.patch(`/tasks/${id}`, data);
    return res.data;
  },

  /**
   * Execute/start a task
   */
  async executeTask(id: string): Promise<Task> {
    const res = await api.post(`/tasks/${id}/execute`);
    return res.data;
  },

  /**
   * Pause a running task
   */
  async pauseTask(id: string): Promise<Task> {
    const res = await api.post(`/tasks/${id}/pause`);
    return res.data;
  },

  /**
   * Resume a paused task
   */
  async resumeTask(id: string): Promise<Task> {
    const res = await api.post(`/tasks/${id}/resume`);
    return res.data;
  },

  /**
   * Retry a failed task
   */
  async retryTask(id: string): Promise<Task> {
    const res = await api.post(`/tasks/${id}/retry`);
    return res.data;
  },

  /**
   * Cancel a running task
   */
  async cancelTask(id: string): Promise<Task> {
    const res = await api.post(`/tasks/${id}/cancel`);
    return res.data;
  },

  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<void> {
    await api.delete(`/tasks/${id}`);
  },

  /**
   * Get logs for a task
   */
  async getTaskLogs(id: string): Promise<{
    logs: Array<{
      timestamp: string;
      level: 'info' | 'warn' | 'error';
      message: string;
      agent?: string;
    }>;
  }> {
    const res = await api.get(`/tasks/${id}/logs`);
    return res.data;
  },

  /**
   * Get task execution steps
   */
  async getTaskSteps(id: string): Promise<{
    steps: Array<{
      id: string;
      stepType: string;
      status: string;
      output?: unknown;
      error?: string;
      duration?: number;
    }>;
  }> {
    const res = await api.get(`/tasks/${id}/steps`);
    return res.data;
  },

  /**
   * Get task progress in realtime
   */
  async getTaskProgress(id: string): Promise<{
    progress: number;
    currentStep?: string;
    totalSteps?: number;
  }> {
    const res = await api.get(`/tasks/${id}/progress`);
    return res.data;
  },
};