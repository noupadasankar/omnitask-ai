import { VisionAnalysisResult } from '../../../vision/vision.types';

export type RecoveryType = 'selector' | 'navigation' | 'workflow' | 'popup_dismiss';

export interface RecoveryStep {
  action: string;
  target?: string;
  value?: string;
  description: string;
}

export interface RecoveryPlan {
  type: RecoveryType;
  healed: boolean;
  alternativeSelector?: string;
  recoverySteps: RecoveryStep[];
  explanation: string;
  confidence: number;
  insertSteps?: RecoveryStep[];
  resumeAfterRecovery: boolean;
}

export interface HealingContext {
  sessionId: string;
  stepIndex: number;
  action: string;
  target?: string;
  value?: string;
  description: string;
  error: string;
  screenshot?: string;
  url?: string;
  title?: string;
  rawDom?: import('../../../vision/vision.types').RawDomNode[];
  viewport?: { width: number; height: number };
  expectedUrl?: string;
}

export interface HealingResult {
  healed: boolean;
  plan: RecoveryPlan;
  analysis?: VisionAnalysisResult;
  attemptNumber: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}
