export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface BreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  cooldownMs: number;
  timeoutMs: number;
}

export interface BreakerState {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  cooldownEndsAt: number | null;
}

export const DEFAULT_BREAKER_OPTIONS: BreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  cooldownMs: 30_000,
  timeoutMs: 10_000,
};
