export interface WsTaskEvent {
  taskId: string;
  status: string;
  progress?: number;
  stepIndex?: number;
  totalSteps?: number;
}

export interface WsExecutionEvent {
  taskId: string;
  executionId: string;
  stepIndex?: number;
  status: 'STARTED' | 'STEP_START' | 'STEP_COMPLETE' | 'COMPLETED' | 'FAILED';
  data?: any;
  error?: string;
}

export interface WsApprovalEvent {
  approvalId: string;
  taskId: string;
  status: 'REQUIRED' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
}

export type WsEventMap = {
  'task:status': WsTaskEvent;
  'execution:update': WsExecutionEvent;
  'approval:status': WsApprovalEvent;
  'connection': { connected: boolean };
};

export interface ServerToClientEvents {
  'task:status': (data: WsTaskEvent) => void;
  'execution:update': (data: WsExecutionEvent) => void;
  'approval:status': (data: WsApprovalEvent) => void;
  'connection': (data: { connected: boolean }) => void;
}

export interface ClientToServerEvents {
  'watch:task': (taskId: string) => void;
  'unwatch:task': (taskId: string) => void;
}