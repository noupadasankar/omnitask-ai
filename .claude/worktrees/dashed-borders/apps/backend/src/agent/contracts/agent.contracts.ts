export type EvidenceTag =
  | 'evidence:dom'
  | 'evidence:screenshot'
  | 'evidence:extracted'
  | 'evidence:verification'
  | 'evidence:approval'
  | 'evidence:plan'
  | 'evidence:replan'
  | 'evidence:replay'
  | 'evidence:result';

export type ArtifactEvidenceKind = 'EVIDENCE' | 'VERIFICATION' | 'PLAN_LEDGER';

export interface AgentInput {
  userId: string;
  taskId: string;
  sessionId: string;
  goal: string;
  parsedGoal?: {
    taskType: string;
    intent: string;
    entities?: Record<string, any>;
    constraints?: string[];
    requiresPayment?: boolean;
    requiresLogin?: boolean;
  } | null;
  userProfileCard?: Record<string, any> | null;
  planHash?: string | null;
  activePlanHash?: string | null;
  permissions?: {
    allowUploads: boolean;
    allowApprovals: boolean;
    allowPayments: boolean;
  };
}

export interface AgentPlanFingerprint {
  planHash: string;
  createdAt: number;
  model?: string;
  frozen: boolean;
}

export interface AgentPlan {
  goal: string;
  steps: Array<{
    index: number;
    action: string;
    target?: string;
    value?: string;
    description: string;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    requiresApproval?: boolean;
    skillName?: string;
  }>;
  estimatedDurationSec?: number;
  plan: AgentPlanFingerprint;
  // Optional: store routing metadata for traceability
  metadata?: Record<string, any>;
}

export interface AgentEvidence {
  kind: ArtifactEvidenceKind;
  title: string;
  tags: EvidenceTag[];
  // Prefer structured JSON; keep optional `text` for OCR-like artifacts.
  text?: string;
  data?: unknown;
  // Storage pointer can map to object storage (MinIO/S3) later.
  storageKey?: string;
}

export interface AgentOutcome {
  verified: boolean;
  confidence: number; // 0..1
  score?: number; // 0..100
  nextAction?: 'accept' | 'retry' | 'replan' | 'notify_user';
  reasoning: string;
  gaps?: string[];
  achievements?: string[];
  evidence?: AgentEvidence[];
}

