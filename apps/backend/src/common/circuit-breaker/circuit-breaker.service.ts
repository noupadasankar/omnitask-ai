import { Injectable, Logger } from '@nestjs/common';
import {
  BreakerOptions,
  BreakerState,
  CircuitState,
  DEFAULT_BREAKER_OPTIONS,
} from './circuit-breaker.types';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, BreakerState>();
  private readonly options = new Map<string, BreakerOptions>();

  register(name: string, opts?: Partial<BreakerOptions>): void {
    if (this.breakers.has(name)) return;
    const merged: BreakerOptions = { ...DEFAULT_BREAKER_OPTIONS, ...opts };
    this.breakers.set(name, {
      name,
      state: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      cooldownEndsAt: null,
    });
    this.options.set(name, merged);
    this.logger.log(`Circuit breaker registered: ${name}`);
  }

  isAllowed(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (!breaker) return true;

    if (breaker.state === CircuitState.CLOSED) return true;

    if (breaker.state === CircuitState.OPEN) {
      const now = Date.now();
      if (breaker.cooldownEndsAt && now >= breaker.cooldownEndsAt) {
        this.logger.warn(`Circuit ${name} transitioning OPEN → HALF_OPEN`);
        breaker.state = CircuitState.HALF_OPEN;
        breaker.successCount = 0;
        return true;
      }
      return false;
    }

    if (breaker.state === CircuitState.HALF_OPEN) {
      return true;
    }

    return true;
  }

  onSuccess(name: string): void {
    const breaker = this.breakers.get(name);
    if (!breaker) return;

    breaker.lastSuccessTime = Date.now();

    if (breaker.state === CircuitState.HALF_OPEN) {
      breaker.successCount++;
      const opts = this.options.get(name)!;
      if (breaker.successCount >= opts.successThreshold) {
        this.logger.log(`Circuit ${name} recovered: HALF_OPEN → CLOSED`);
        breaker.state = CircuitState.CLOSED;
        breaker.failureCount = 0;
        breaker.successCount = 0;
        breaker.cooldownEndsAt = null;
      }
    } else if (breaker.state === CircuitState.CLOSED) {
      breaker.failureCount = 0;
    }
  }

  onFailure(name: string): void {
    const breaker = this.breakers.get(name);
    if (!breaker) return;

    breaker.lastFailureTime = Date.now();
    breaker.failureCount++;
    const opts = this.options.get(name)!;

    if (
      breaker.state === CircuitState.CLOSED &&
      breaker.failureCount >= opts.failureThreshold
    ) {
      this.logger.warn(`Circuit ${name} opening: CLOSED → OPEN (${breaker.failureCount} failures)`);
      breaker.state = CircuitState.OPEN;
      breaker.cooldownEndsAt = Date.now() + opts.cooldownMs;
    } else if (breaker.state === CircuitState.HALF_OPEN) {
      this.logger.warn(`Circuit ${name} half-open test failed: HALF_OPEN → OPEN`);
      breaker.state = CircuitState.OPEN;
      breaker.cooldownEndsAt = Date.now() + opts.cooldownMs;
    }
  }

  getState(name: string): BreakerState | undefined {
    return this.breakers.get(name);
  }

  getAllStates(): BreakerState[] {
    return Array.from(this.breakers.values());
  }

  getOptions(name: string): BreakerOptions | undefined {
    return this.options.get(name);
  }

  reset(name: string): void {
    const existing = this.breakers.get(name);
    if (existing) {
      existing.state = CircuitState.CLOSED;
      existing.failureCount = 0;
      existing.successCount = 0;
      existing.lastFailureTime = null;
      existing.lastSuccessTime = null;
      existing.cooldownEndsAt = null;
      this.logger.log(`Circuit ${name} manually reset to CLOSED`);
    }
  }
}
