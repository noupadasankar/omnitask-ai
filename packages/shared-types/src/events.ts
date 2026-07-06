export interface StepStartedPayload {
  sessionId: string;
  stepIndex: number;
  action: string;
  target?: string;
  timestamp: string;
}

export interface StepCompletedPayload {
  sessionId: string;
  stepIndex: number;
  result: { success: boolean; currentUrl?: string; durationMs: number };
  timestamp: string;
}

export interface StepFailedPayload {
  sessionId: string;
  stepIndex: number;
  error: { code: string; message: string; recoverable: boolean };
  timestamp: string;
}

export interface ScreenshotPayload {
  sessionId: string;
  stepIndex: number;
  imageUrl: string;
  pageTitle?: string;
  timestamp: string;
}

export interface ApprovalRequestedPayload {
  sessionId: string;
  stepIndex: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  expiresAt: string;
}

export interface ApprovalResolvedPayload {
  sessionId: string;
  stepIndex: number;
  approved: boolean;
}

export interface VerificationResultPayload {
  sessionId: string;
  stepIndex: number;
  score: number;
  passed: boolean;
}

export interface ExecutionCompletedPayload {
  sessionId: string;
  taskId: string;
  success: boolean;
  summary?: string;
  stepsCompleted: number;
  stepsFailed: number;
  durationMs: number;
}

export interface ExecutionFailedPayload {
  sessionId: string;
  taskId: string;
  reason: string;
}

export interface SessionPhasePayload {
  sessionId: string;
  phase: 'goal_intake' | 'planning' | 'policy_check' | 'approval' | 'dispatching' | 'executing' | 'verifying' | 'completed' | 'failed';
}

export interface LogEntryPayload {
  sessionId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export type ServerEventMap = {
  'session:started': { sessionId: string; taskId: string };
  'session:phase': SessionPhasePayload;
  'step:started': StepStartedPayload;
  'step:completed': StepCompletedPayload;
  'step:failed': StepFailedPayload;
  'screenshot:checkpoint': ScreenshotPayload;
  'approval:requested': ApprovalRequestedPayload;
  'approval:resolved': ApprovalResolvedPayload;
  'verification:result': VerificationResultPayload;
  'execution:completed': ExecutionCompletedPayload;
  'execution:failed': ExecutionFailedPayload;
  'log:entry': LogEntryPayload;
};

export type ClientEventMap = {
  'session:join': { sessionId: string };
  'session:leave': { sessionId: string };
  'approval:respond': { sessionId: string; stepIndex: number; approved: boolean };
  'session:pause': { sessionId: string };
  'session:resume': { sessionId: string };
  'session:cancel': { sessionId: string };
};
