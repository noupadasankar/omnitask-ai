import { z } from 'zod';

export const TaskStatusEnum = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export const TaskPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

export type TaskStatus = z.infer<typeof TaskStatusEnum>;
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: TaskStatusEnum,
  priority: TaskPriorityEnum,
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
  result: z.any().optional(),
  error: z.string().optional(),
});

export const CreateTaskSchema = TaskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  result: true,
  error: true,
});

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'busy';
}

export interface Execution {
  id: string;
  taskId: string;
  step: number;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: any;
  output?: any;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface FileRecord {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  taskId?: string;
  createdAt: Date;
}

export interface Memory {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  content: string;
  embedding?: number[];
  taskId?: string;
  createdAt: Date;
}
