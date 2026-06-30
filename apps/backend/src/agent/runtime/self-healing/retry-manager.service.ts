import { Injectable } from '@nestjs/common';
import { HealingContext, RetryPolicy } from './healing.types';

@Injectable()
export class RetryManagerService {
  private attemptCounts = new Map<string, number>();

  private key(sessionId: string, stepIndex: number): string {
    return `${sessionId}:${stepIndex}`;
  }

  getDefaultPolicy(): RetryPolicy {
    return { maxAttempts: 3, backoffMs: 2000 };
  }

  getAttemptNumber(sessionId: string, stepIndex: number): number {
    return (this.attemptCounts.get(this.key(sessionId, stepIndex)) || 0) + 1;
  }

  recordAttempt(sessionId: string, stepIndex: number): number {
    const k = this.key(sessionId, stepIndex);
    const next = (this.attemptCounts.get(k) || 0) + 1;
    this.attemptCounts.set(k, next);
    return next;
  }

  shouldRetry(context: HealingContext, policy = this.getDefaultPolicy()): boolean {
    const attempts = this.attemptCounts.get(this.key(context.sessionId, context.stepIndex)) || 0;
    return attempts < policy.maxAttempts;
  }

  clearSession(sessionId: string): void {
    for (const k of this.attemptCounts.keys()) {
      if (k.startsWith(`${sessionId}:`)) this.attemptCounts.delete(k);
    }
  }
}
