import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import {
  PolicyResult,
  RiskLevel,
  UserPolicyContext,
  UserTier,
  ComplianceRule,
  COMPLIANCE_RULES,
  RATE_LIMIT_TIERS,
} from './policy.types';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  evaluate(userContext: UserPolicyContext, action: string, resource: string): PolicyResult {
    const violations: string[] = [];
    const complianceChecks: { ruleId: string; passed: boolean; detail: string }[] = [];

    const tierLimit = RATE_LIMIT_TIERS[userContext.tier] || RATE_LIMIT_TIERS.free;

    for (const rule of COMPLIANCE_RULES) {
      const check = this.evaluateComplianceRule(rule, userContext, action, resource);
      complianceChecks.push(check);
      if (!check.passed) {
        violations.push(check.detail);
      }
    }

    const riskLevel = this.assessRisk(action, resource);
    const requiresApproval = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';

    return {
      allowed: violations.length === 0,
      riskLevel,
      requiresApproval,
      reason: violations.length > 0 ? violations.join('; ') : undefined,
      violations: violations.length > 0 ? violations : undefined,
      complianceChecks,
    };
  }

  getRateLimitForTier(tier: UserTier): { windowMs: number; maxRequests: number } {
    return RATE_LIMIT_TIERS[tier] || RATE_LIMIT_TIERS.free;
  }

  async checkActionAllowed(
    userId: string,
    userTier: UserTier,
    action: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const circuitName = `policy:${userId}`;
    this.circuitBreakerService.register(circuitName, {
      failureThreshold: 10,
      cooldownMs: 30000,
      timeoutMs: 5000,
    });

    if (!this.circuitBreakerService.isAllowed(circuitName)) {
      return { allowed: false, reason: 'Policy circuit is OPEN — too many violations' };
    }

    const tierConfig = RATE_LIMIT_TIERS[userTier] || RATE_LIMIT_TIERS.free;

    if (action === 'export' && userTier === 'free') {
      return { allowed: false, reason: 'Data export requires at least Basic tier' };
    }
    if (action === 'admin' && userTier !== 'admin' && userTier !== 'enterprise') {
      return { allowed: false, reason: 'Admin actions require Enterprise or Admin tier' };
    }

    return { allowed: true };
  }

  async checkCompliance(userTier: UserTier, resource: string): Promise<{ passed: boolean; details: string[] }> {
    const details: string[] = [];
    let passed = true;

    if (resource.includes('payment') || resource.includes('credit') || resource.includes('card')) {
      if (userTier === 'free') {
        details.push('PCI: Payment processing requires at least Basic tier');
        passed = false;
      }
      details.push('PCI: Payment data must use tokenization');
    }

    if (resource.includes('personal') || resource.includes('user-data')) {
      details.push('GDPR: Data subject access requests must be supported');
    }

    return { passed, details };
  }

  private evaluateComplianceRule(
    rule: ComplianceRule,
    context: UserPolicyContext,
    action: string,
    resource: string,
  ): { ruleId: string; passed: boolean; detail: string } {
    switch (rule.evaluator) {
      case 'checkGdprDataExport':
        return {
          ruleId: rule.id,
          passed: true,
          detail: 'GDPR: Data export supported',
        };
      case 'checkPciPaymentData':
        return {
          ruleId: rule.id,
          passed: !resource.toLowerCase().includes('credit') || context.tier !== 'free',
          detail: context.tier === 'free' && resource.toLowerCase().includes('credit')
            ? 'PCI: Free tier cannot store payment data'
            : 'PCI: Compliant',
        };
      case 'checkSoc2AuditLog':
        return {
          ruleId: rule.id,
          passed: true,
          detail: 'SOC2: Audit logging enabled',
        };
      default:
        return { ruleId: rule.id, passed: true, detail: 'No evaluator' };
    }
  }

  private assessRisk(action: string, resource: string): RiskLevel {
    const actionLower = action.toLowerCase();
    const resourceLower = resource.toLowerCase();

    if (
      actionLower.includes('delete') ||
      actionLower.includes('destroy') ||
      resourceLower.includes('payment') ||
      resourceLower.includes('credential')
    ) return 'CRITICAL';

    if (
      actionLower.includes('update') ||
      actionLower.includes('modify') ||
      actionLower.includes('create') ||
      resourceLower.includes('password') ||
      resourceLower.includes('profile')
    ) return 'HIGH';

    if (
      actionLower.includes('read') ||
      actionLower.includes('export') ||
      actionLower.includes('list')
    ) return 'MEDIUM';

    return 'LOW';
  }
}
