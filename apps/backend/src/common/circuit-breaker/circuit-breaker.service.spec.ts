import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CircuitState } from './circuit-breaker.types';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();
    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  describe('register', () => {
    it('should register a new breaker with CLOSED state', () => {
      service.register('test-svc');
      const state = service.getState('test-svc');
      expect(state).toBeDefined();
      expect(state!.state).toBe(CircuitState.CLOSED);
      expect(state!.failureCount).toBe(0);
    });

    it('should not re-register if already exists', () => {
      service.register('svc');
      service.register('svc', { failureThreshold: 99 });
      const opts = service.getOptions('svc');
      expect(opts!.failureThreshold).not.toBe(99);
    });

    it('should store merged options', () => {
      service.register('custom-svc', { failureThreshold: 3, cooldownMs: 5000 });
      const opts = service.getOptions('custom-svc');
      expect(opts!.failureThreshold).toBe(3);
      expect(opts!.cooldownMs).toBe(5000);
      expect(opts!.timeoutMs).toBeDefined(); // default
    });
  });

  describe('isAllowed', () => {
    it('should allow when CLOSED', () => {
      service.register('svc');
      expect(service.isAllowed('svc')).toBe(true);
    });

    it('should allow when not registered', () => {
      expect(service.isAllowed('ghost')).toBe(true);
    });

    it('should deny when OPEN and cooldown not elapsed', () => {
      service.register('svc', { cooldownMs: 60000 });
      // Force open
      for (let i = 0; i < 10; i++) service.onFailure('svc');
      expect(service.isAllowed('svc')).toBe(false);
    });

    it('should transition to HALF_OPEN when cooldown passed', () => {
      service.register('svc', { cooldownMs: -1000 }); // already expired
      for (let i = 0; i < 10; i++) service.onFailure('svc');
      // cooldown is in the past — should transition to HALF_OPEN
      const allowed = service.isAllowed('svc');
      expect(allowed).toBe(true);
      expect(service.getState('svc')!.state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('onSuccess', () => {
    it('should reset failure count when CLOSED', () => {
      service.register('svc');
      service.onFailure('svc');
      service.onFailure('svc');
      expect(service.getState('svc')!.failureCount).toBe(2);
      service.onSuccess('svc');
      expect(service.getState('svc')!.failureCount).toBe(0);
    });

    it('should close circuit after success threshold in HALF_OPEN', () => {
      service.register('svc', { successThreshold: 2 });
      // Force open then half-open
      for (let i = 0; i < 10; i++) service.onFailure('svc');
      service.isAllowed('svc'); // → HALF_OPEN (cooldown expired)
      // Reset cooldown
      const state = service.getState('svc')!;
      state.cooldownEndsAt = Date.now() - 1000;
      service.isAllowed('svc'); // → HALF_OPEN
      service.onSuccess('svc');
      expect(service.getState('svc')!.state).toBe(CircuitState.HALF_OPEN);
      service.onSuccess('svc');
      expect(service.getState('svc')!.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('onFailure', () => {
    it('should open circuit when threshold exceeded', () => {
      service.register('svc', { failureThreshold: 3 });
      service.onFailure('svc');
      service.onFailure('svc');
      service.onFailure('svc');
      expect(service.getState('svc')!.state).toBe(CircuitState.OPEN);
    });

    it('should not open before threshold', () => {
      service.register('svc', { failureThreshold: 5 });
      service.onFailure('svc');
      service.onFailure('svc');
      expect(service.getState('svc')!.state).toBe(CircuitState.CLOSED);
    });

    it('should re-open when half-open test fails', () => {
      service.register('svc', { failureThreshold: 3, cooldownMs: -1000 });
      for (let i = 0; i < 3; i++) service.onFailure('svc');
      // Move to half-open
      expect(service.getState('svc')!.state).toBe(CircuitState.OPEN);
      service.isAllowed('svc'); // → HALF_OPEN
      service.onFailure('svc'); // fails in half-open
      expect(service.getState('svc')!.state).toBe(CircuitState.OPEN);
    });

    it('should be no-op for unregistered breaker', () => {
      expect(() => service.onFailure('ghost')).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should reset breaker to CLOSED with zero counts', () => {
      service.register('svc');
      for (let i = 0; i < 10; i++) service.onFailure('svc');
      service.reset('svc');
      const state = service.getState('svc')!;
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failureCount).toBe(0);
    });
  });

  describe('getAllStates', () => {
    it('should return all registered breakers', () => {
      service.register('a');
      service.register('b');
      expect(service.getAllStates()).toHaveLength(2);
    });
  });
});
