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
  | 'automation:gate'
  | 'browser:initialized'
  | 'browser:state'
  | 'execution:state'
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
  url?: string;
  title?: string;
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
  /** True when this is the pre-launch automation gate (browser not yet open). */
  gate?: boolean;
  /** Domains the plan will navigate to (populated for launch-gate approvals). */
  targetDomains?: string[];
  actionDetails: {
    action: string;
    target?: string;
    value?: string;
    description: string;
  };
  expiresAt: string;
}

/** Browser lifecycle state mirrored from the backend state machine. */
export type BrowserState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'ERROR';

/**
 * Derived execution state mirrored from the backend authority. The frontend is
 * purely reflective — it never computes this, only displays what it receives.
 */
export type ExecutionState =
  | 'IDLE'
  | 'PLANNING'
  | 'PLAN_READY'
  | 'WAITING_APPROVAL'
  | 'BROWSER_INITIALIZING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ERROR';

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
  skillName?: string;
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

export type CognitiveOutcomeType = 'SUCCESS' | 'SAFE_ABORT' | 'ESCALATED' | 'FAILED';

export interface CognitiveOutcome {
  type: CognitiveOutcomeType;
  explanation: string;
  confidence: number;
  timestamp: number;
}
