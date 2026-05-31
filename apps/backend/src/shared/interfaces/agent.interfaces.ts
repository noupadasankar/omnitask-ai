// backend/src/shared/interfaces/agent.interfaces.ts

export interface AgentPlan {
  taskId: string;
  goal: string;
  steps: PlannedStep[];
  estimatedDuration: number; // seconds
  riskAssessment: RiskAssessment;
  skillsUsed?: string[];
  metadata?: Record<string, any>;
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

export interface VisionAnalysis {
  currentState: string;
  elementsDetected: DetectedElement[];
  suggestedAction: SuggestedAction;
  confidence: number;
  isExpectedState: boolean;
  errorDetected: boolean;
  errorDescription?: string;
}

export interface DetectedElement {
  type: string;
  text?: string;
  selector?: string;
  boundingBox?: BoundingBox;
  isInteractable: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SuggestedAction {
  action: BrowserAction;
  target?: string;
  value?: string;
  reasoning: string;
  confidence: number;
}

export interface ScreenshotFrame {
  sessionId: string;
  stepIndex: number;
  timestamp: number;
  base64: string;
  width: number;
  height: number;
  cursorPosition?: { x: number; y: number };
  highlightedElement?: BoundingBox;
}

export interface ExecutionEvent {
  sessionId: string;
  type: ExecutionEventType;
  timestamp: number;
  data: any;
}

export type ExecutionEventType =
  | 'session:started'
  | 'session:completed'
  | 'session:failed'
  | 'session:paused'
  | 'session:cancelled'
  | 'plan:created'
  | 'plan:updated'
  | 'step:started'
  | 'step:completed'
  | 'step:failed'
  | 'step:retrying'
  | 'screenshot:captured'
  | 'screenshot:streamed'
  | 'vision:analysis'
  | 'approval:requested'
  | 'approval:responded'
  | 'browser:navigated'
  | 'browser:console'
  | 'browser:error'
  | 'browser:download'
  | 'memory:stored'
  | 'memory:recalled'
  | 'log:info'
  | 'log:warn'
  | 'log:error';

export interface PolicyCheckResult {
  allowed: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresApproval: boolean;
  reason?: string;
  blockedPatterns?: string[];
}

export interface BrowserSessionConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  userAgent?: string;
  proxy?: { server: string; username?: string; password?: string };
  stealth: boolean;
  screenshotInterval: number;
  timeout: number;
  maxRetries: number;
}

export const DEFAULT_BROWSER_CONFIG: BrowserSessionConfig = {
  headless: true,
  viewport: { width: 1920, height: 1080 },
  stealth: true,
  screenshotInterval: 500,
  timeout: 30000,
  maxRetries: 3,
};

export type AgentMemoryType = 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL' | 'WORKING';

export interface AgentMemory {
  id: string;
  userId: string;
  type: AgentMemoryType;
  key: string;
  content: string;
  importance: number;
  accessCount: number;
  lastAccessedAt?: Date | null;
  expiresAt?: Date | null;
  metadata?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}
