import { Injectable, Logger } from '@nestjs/common';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { ParsedGoal } from '../goal-understanding.service';
import { PolicyService } from '../../common/policy/policy.service';

export type AutomationMode = 'autonomous' | 'approval_required' | 'simulation';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Result of the policy engine's plan check (the bits the gate needs). */
export interface PolicyCheckSummary {
  approved: boolean;
  overallRisk: RiskLevel;
  blockedSteps: number[];
  requiresApprovalSteps: number[];
}

export interface GateInput {
  mode?: AutomationMode;
  allowPayments?: boolean;
  allowLogin?: boolean;
}

export interface GateDecision {
  /** false → hard block; the browser must never open. */
  proceed: boolean;
  /** true → explicit user approval is required BEFORE the browser launches. */
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  /** Human-readable summary shown to the user / logged. */
  reason: string;
  /** Distinct domains the plan intends to navigate to. */
  targetDomains: string[];
  /** Why approval / blocking was triggered — drives the UI checklist. */
  triggers: {
    blockedByPolicy: boolean;
    approvalRequiredMode: boolean;
    highRiskSteps: boolean;
    payment: boolean;
    login: boolean;
    sensitiveData: boolean;
  };
}

/**
 * The Automation Gate — the mandatory boundary between DECISION and EXECUTION.
 *
 * It runs AFTER a plan is produced and the policy engine has checked it, but
 * BEFORE any browser is launched. It answers two questions:
 *   1. May this plan run at all?            → `proceed`
 *   2. Does the user have to approve first? → `requiresApproval`
 *
 * The gate itself never touches the browser — it only decides. The
 * ExecutionEngine enforces the decision (holding for approval, then launching).
 */
@Injectable()
export class AutomationGateService {
  private readonly logger = new Logger(AutomationGateService.name);

  constructor(
    private readonly policyService: PolicyService,
  ) {}

  evaluate(
    plan: AgentPlan,
    parsedGoal: ParsedGoal | undefined,
    policy: PolicyCheckSummary,
    input: GateInput,
  ): GateDecision {
    const targetDomains = this.collectDomains(plan);

    const blockedByPolicy = policy.blockedSteps.length > 0;
    const approvalRequiredMode = input.mode === 'approval_required';
    const highRiskSteps = policy.requiresApprovalSteps.length > 0;
    const payment = !!parsedGoal?.requiresPayment && !input.allowPayments;
    const login = !!parsedGoal?.requiresLogin && !input.allowLogin;
    const sensitiveData = !!parsedGoal?.sensitiveData;

    const requiresApproval =
      !blockedByPolicy &&
      (approvalRequiredMode || highRiskSteps || payment || login || sensitiveData);

    const reasonParts: string[] = [];
    if (blockedByPolicy) reasonParts.push('plan blocked by safety policy');
    if (approvalRequiredMode) reasonParts.push('approval-required mode');
    if (highRiskSteps)
      reasonParts.push(
        `${policy.requiresApprovalSteps.length} high-risk step(s)`,
      );
    if (payment) reasonParts.push('payment flow (not pre-authorized)');
    if (login) reasonParts.push('login flow (not pre-authorized)');
    if (sensitiveData) reasonParts.push('sensitive data involved');

    const decision: GateDecision = {
      proceed: !blockedByPolicy,
      requiresApproval,
      riskLevel: policy.overallRisk,
      reason: blockedByPolicy
        ? `Blocked: ${reasonParts.join('; ')}`
        : requiresApproval
          ? `Launch needs approval: ${reasonParts.join('; ')}`
          : 'Auto-approved — safe, autonomous launch',
      targetDomains,
      triggers: {
        blockedByPolicy,
        approvalRequiredMode,
        highRiskSteps,
        payment,
        login,
        sensitiveData,
      },
    };

    this.logger.log(
      `[AutomationGate] proceed=${decision.proceed} approval=${decision.requiresApproval} ` +
        `risk=${decision.riskLevel} domains=[${targetDomains.join(', ')}] :: ${decision.reason}`,
    );

    return decision;
  }

  /** Distinct hostnames from the plan's navigate steps. */
  private collectDomains(plan: AgentPlan): string[] {
    const domains = new Set<string>();
    for (const step of plan.steps || []) {
      if (step.action === 'navigate' && step.value) {
        try {
          domains.add(new URL(step.value).hostname.replace(/^www\./, ''));
        } catch {
          /* ignore unparseable URLs — policy engine already flags these */
        }
      }
    }
    return [...domains];
  }
}
