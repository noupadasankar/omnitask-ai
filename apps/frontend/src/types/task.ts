export type TaskStatus =
  | 'QUEUED'
  | 'PLANNING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

export interface Task {
  id: string;

  title: string;

  naturalLanguage: string;

  status: TaskStatus;

  createdAt: string;
}