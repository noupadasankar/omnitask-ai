import { AgentPlan, CognitiveOutcome, BrowserSessionConfig } from '../../shared/interfaces/agent.interfaces';
import { ParsedGoal } from '../goal-understanding.service';
import { GateDecision } from '../runtime/automation-gate.service';
import { VerificationResult } from '../verifier-agent.service';

export interface StepResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface PolicyCheckSummary {
  approved: boolean;
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blockedSteps: number[];
  requiresApprovalSteps: number[];
  stepChecks: Array<{ stepIndex: number; check: { allowed: boolean; requiresApproval: boolean; riskLevel: string; reason?: string } }>;
}

export enum PipelineExitReason {
  POLICY_FAILED = 'policy_failed',
  LAUNCH_DENIED = 'launch_denied',
  SIMULATION_COMPLETED = 'simulation_completed',
  ADAPTER_COMPLETED = 'adapter_completed',
  WORKER_DISPATCHED = 'worker_dispatched',
  // Version A — Prepare & Confirm
  PENDING_USER_CONFIRMATION = 'pending_user_confirmation',
  CONFIRMATION_EXPIRED = 'confirmation_expired',
  CONFIRMATION_REJECTED = 'confirmation_rejected',
  CONFIRMATION_EDITED_AND_APPROVED = 'confirmation_edited_and_approved',
}

export class ExecutionContext {
  constructor(
    public readonly sessionId: string,
    public readonly goal: string,
    public readonly config?: Partial<BrowserSessionConfig>,
    public parsedGoal?: ParsedGoal,
  ) {}

  userId: string | null = null;
  taskId: string | null = null;

  plan?: AgentPlan;
  executionGraph?: any;
  planBuilt = false;
  policyCheck?: PolicyCheckSummary;
  gateDecision?: GateDecision;
  skillHint?: string | null = null;
  routedDomain?: string;
  dispatchedToWorker = false;
  executedInline = false;

  stepResults: StepResult[] = [];
  errorHistory: string[] = [];
  stepsCompleted = 0;
  stepsFailed = 0;
  totalSteps = 0;
  completedSuccessfully = true;
  failureReason: string | null = null;

  verificationResult?: VerificationResult;
  cognitiveOutcome?: CognitiveOutcome;
  systemConfidence?: number;

  executionStart = Date.now();
  durationMs = 0;

  exitReason?: PipelineExitReason;
}
