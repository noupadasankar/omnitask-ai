export enum ExecutionPhase {
  IDLE = 'idle',
  PARSING = 'parsing',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  PAUSED = 'paused',
  WAITING_CLARIFICATION = 'waiting_clarification',
  WAITING_APPROVAL = 'waiting_approval',
  WAITING_OTP = 'waiting_otp',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum BrowserAction {
  NAVIGATE = 'navigate',
  CLICK = 'click',
  TYPE = 'type',
  SELECT = 'select',
  SCROLL = 'scroll',
  HOVER = 'hover',
  SCREENSHOT = 'screenshot',
  WAIT = 'wait',
  PRESS_KEY = 'press_key',
  UPLOAD_FILE = 'upload_file',
  EXTRACT_TEXT = 'extract_text',
  EXTRACT_DATA = 'extract_data',
  SOLVE_CAPTCHA = 'solve_captcha',
  SWITCH_TAB = 'switch_tab',
  CLOSE_TAB = 'close_tab',
  GO_BACK = 'go_back',
  GO_FORWARD = 'go_forward',
  REFRESH = 'refresh',
  EVALUATE = 'evaluate',
  DRAG_DROP = 'drag_drop',
  RIGHT_CLICK = 'right_click',
  DOUBLE_CLICK = 'double_click',
}

export enum StepAgent {
  ORCHESTRATOR = 'ORCHESTRATOR',
  BROWSER_AGENT = 'BROWSER_AGENT',
  VISION_AGENT = 'VISION_AGENT',
  DATA_AGENT = 'DATA_AGENT',
  FORM_AGENT = 'FORM_AGENT',
  VERIFIER_AGENT = 'VERIFIER_AGENT',
}

export interface ExecutionPlan {
  taskId: string;
  goal: string;
  steps: PlannedStep[];
  totalSteps: number;
  estimatedDurationMs?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PlannedStep {
  index: number;
  action: string;
  target?: string;
  value?: string;
  description: string;
  agent: StepAgent;
  requiresApproval: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface StepResult {
  stepIndex: number;
  success: boolean;
  durationMs: number;
  currentUrl?: string;
  screenshot?: string;
  extractedData?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  verifyScore?: number;
}

export interface ExecutionState {
  sessionId: string;
  taskId: string;
  phase: ExecutionPhase;
  plan?: ExecutionPlan;
  currentStepIndex: number;
  stepsCompleted: number;
  stepsFailed: number;
  results: StepResult[];
  startedAt?: string;
  durationMs?: number;
}

export interface ParsedGoal {
  taskType: string;
  entities: Record<string, string>;
  constraints: string[];
  ambiguityScore: number;
  suggestedDomain?: string;
  confidence: number;
}
