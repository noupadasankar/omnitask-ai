// backend/src/agent/policy-engine.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  PolicyCheckResult,
  PlannedStep,
  AgentPlan,
} from '../shared/interfaces/agent.interfaces';

@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger(PolicyEngineService.name);

  private readonly BLOCKED_DOMAINS = [
    'bank', 'banking', 'paypal.com', 'venmo.com',
    'crypto', 'trading', 'coinbase',
    'admin', 'root', 'internal',
  ];

  private readonly DANGEROUS_ACTIONS = [
    { pattern: /delete|remove|destroy/i, risk: 'CRITICAL' as const },
    { pattern: /payment|purchase|buy|checkout|pay/i, risk: 'CRITICAL' as const },
    { pattern: /transfer|send money|wire/i, risk: 'CRITICAL' as const },
    { pattern: /password|credential|secret/i, risk: 'HIGH' as const },
    { pattern: /post|publish|tweet|share publicly/i, risk: 'HIGH' as const },
    { pattern: /sign up|register|create account/i, risk: 'MEDIUM' as const },
    { pattern: /submit|apply|send/i, risk: 'MEDIUM' as const },
    { pattern: /download|install/i, risk: 'MEDIUM' as const },
  ];

  private readonly BLOCKED_JS_PATTERNS = [
    /eval\s*\(/i,
    /document\.cookie/i,
    /localStorage\.setItem/i,
    /fetch\s*\(\s*['"](?!https?:\/\/)/i,
    /XMLHttpRequest/i,
    /window\.open/i,
    /document\.write/i,
  ];

  checkStep(step: PlannedStep): PolicyCheckResult {
    const issues: string[] = [];
    let maxRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (step.action === 'navigate' && step.value) {
      const urlCheck = this.checkUrl(step.value);
      if (!urlCheck.allowed) {
        return urlCheck;
      }
      if (this.compareRisk(urlCheck.riskLevel, maxRisk) > 0) {
        maxRisk = urlCheck.riskLevel;
      }
    }

    for (const da of this.DANGEROUS_ACTIONS) {
      const textToCheck = `${step.description} ${step.value || ''} ${step.target || ''}`;
      if (da.pattern.test(textToCheck)) {
        issues.push(`Potentially dangerous: matches "${da.pattern.source}"`);
        if (this.compareRisk(da.risk, maxRisk) > 0) {
          maxRisk = da.risk;
        }
      }
    }

    if (step.action === 'evaluate' && step.value) {
      for (const pattern of this.BLOCKED_JS_PATTERNS) {
        if (pattern.test(step.value)) {
          return {
            allowed: false,
            riskLevel: 'CRITICAL',
            requiresApproval: true,
            reason: `Blocked JavaScript pattern: ${pattern.source}`,
            blockedPatterns: [pattern.source],
          };
        }
      }
      maxRisk = 'HIGH';
    }

    if (step.action === 'upload_file') {
      maxRisk = 'HIGH';
      issues.push('File upload detected');
    }

    const requiresApproval =
      maxRisk === 'HIGH' || maxRisk === 'CRITICAL' || step.requiresApproval;

    return {
      allowed: true,
      riskLevel: maxRisk,
      requiresApproval,
      reason: issues.length > 0 ? issues.join('; ') : undefined,
    };
  }

  checkPlan(plan: AgentPlan): {
    approved: boolean;
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    stepChecks: Array<{ stepIndex: number; check: PolicyCheckResult }>;
    blockedSteps: number[];
    requiresApprovalSteps: number[];
  } {
    let overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    const stepChecks: Array<{ stepIndex: number; check: PolicyCheckResult }> = [];
    const blockedSteps: number[] = [];
    const requiresApprovalSteps: number[] = [];

    for (const step of plan.steps) {
      const check = this.checkStep(step);
      stepChecks.push({ stepIndex: step.index, check });

      if (!check.allowed) {
        blockedSteps.push(step.index);
      }
      if (check.requiresApproval) {
        requiresApprovalSteps.push(step.index);
      }
      if (this.compareRisk(check.riskLevel, overallRisk) > 0) {
        overallRisk = check.riskLevel;
      }
    }

    return {
      approved: blockedSteps.length === 0,
      overallRisk,
      stepChecks,
      blockedSteps,
      requiresApprovalSteps,
    };
  }

  private checkUrl(url: string): PolicyCheckResult {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      for (const blocked of this.BLOCKED_DOMAINS) {
        if (hostname.includes(blocked)) {
          return {
            allowed: false,
            riskLevel: 'CRITICAL',
            requiresApproval: true,
            reason: `Blocked domain pattern: "${blocked}" in ${hostname}`,
            blockedPatterns: [blocked],
          };
        }
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          allowed: false,
          riskLevel: 'CRITICAL',
          requiresApproval: true,
          reason: `Blocked protocol: ${parsed.protocol}`,
        };
      }

      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.endsWith('.local')
      ) {
        return {
          allowed: false,
          riskLevel: 'CRITICAL',
          requiresApproval: true,
          reason: 'Navigation to internal/local addresses is blocked',
        };
      }

      return { allowed: true, riskLevel: 'LOW', requiresApproval: false };
    } catch {
      return {
        allowed: false,
        riskLevel: 'HIGH',
        requiresApproval: true,
        reason: `Invalid URL: ${url}`,
      };
    }
  }

  private compareRisk(
    a: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    b: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  ): number {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    return order[a] - order[b];
  }
}
