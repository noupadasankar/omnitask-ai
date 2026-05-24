export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
}

export interface Task {
  id: string;
  rawInput: string;
  status: string;
  progress?: number;
  steps?: Step[];
}

export interface Step {
  id: string;
  index: number;
  action: string;
  result?: any;
  error?: string;
  duration?: number;
}