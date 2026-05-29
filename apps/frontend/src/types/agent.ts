export type ExecutionEventType =
  | 'session:started'
  | 'session:completed'
  | 'session:failed'
  | 'session:paused'
  | 'session:cancelled'
  | 'plan:created'
  | 'plan:replanned'
  | 'step:started'
  | 'step:completed'
  | 'step:failed'
  | 'step:blocked'
  | 'step:denied'
  | 'step:validation_failed'
  | 'approval:requested'
  | 'approval:responded'
  | 'approval:expired'
  | 'browser:initialized'
  | 'execution:paused'
  | 'execution:resumed'
  | 'execution:cancelled'
  | 'execution:completed'
  | 'execution:failed'
  | 'log:debug'
  | 'log:info'
  | 'log:warn'
  | 'log:error'
  | 'screenshot:frame'
  | 'execution:event';

export interface ScreenshotFrame {
  sessionId: string;
  stepIndex: number;
  timestamp: number;
  base64: string;
  width: number;
  height: number;
  cursorPosition?: { x: number; y: number };
  highlightedElement?: { x: number; y: number; width: number; height: number };
}

export interface ExecutionEvent {
  type: ExecutionEventType;
  data: Record<string, any>;
  timestamp: number;
}

export interface ApprovalRequest {
  id: string;
  stepIndex: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionDetails: {
    action: string;
    target?: string;
    value?: string;
    description: string;
  };
  expiresAt: string;
}

export interface AgentMemory {
  id: string;
  type: 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL' | 'WORKING';
  key: string;
  content: string;
  importance: number;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
}

export interface ExecutionSession {
  id: string;
  taskId: string;
  status: 'PENDING' | 'PLANNING' | 'RUNNING' | 'PAUSED' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  plan?: AgentPlan;
  currentStepIndex: number;
  totalSteps: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  steps: ExecutionStep[];
}

export interface AgentPlan {
  taskId: string;
  goal: string;
  steps: PlannedStep[];
  estimatedDuration: number;
  riskAssessment: RiskAssessment;
}

export interface PlannedStep {
  index: number;
  action: BrowserAction;
  target?: string;
  value?: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresApproval: boolean;
  fallback?: PlannedStep;
  waitCondition?: WaitCondition;
  validation?: StepValidation;
}

export type BrowserAction =
  | 'navigate'
  | 'click'
  | 'type'
  | 'select'
  | 'scroll'
  | 'hover'
  | 'screenshot'
  | 'wait'
  | 'press_key'
  | 'upload_file'
  | 'extract_text'
  | 'extract_data'
  | 'solve_captcha'
  | 'switch_tab'
  | 'close_tab'
  | 'go_back'
  | 'go_forward'
  | 'refresh'
  | 'evaluate'
  | 'drag_drop'
  | 'right_click'
  | 'double_click';

export interface WaitCondition {
  type: 'selector' | 'navigation' | 'timeout' | 'network_idle' | 'text_visible';
  value: string;
  timeoutMs: number;
}

export interface StepValidation {
  type: 'element_exists' | 'text_contains' | 'url_matches' | 'screenshot_check';
  expected: string;
}

export interface RiskAssessment {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasons: string[];
  requiresUserApproval: boolean;
}

export interface ExecutionStep {
  id: string;
  sessionId: string;
  stepIndex: number;
  action: string;
  target?: string;
  value?: string;
  description: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  durationMs?: number;
  retryCount?: number;
}