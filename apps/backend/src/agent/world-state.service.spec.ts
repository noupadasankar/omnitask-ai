import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateService, BeliefState, RealitySnapshot } from './world-state.service';

describe('WorldStateService', () => {
  let service: WorldStateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorldStateService],
    }).compile();
    service = module.get<WorldStateService>(WorldStateService);
  });

  describe('initializeSession', () => {
    it('should create initial state with default beliefs', () => {
      const state = service.initializeSession('session-1');
      expect(state.sessionId).toBe('session-1');
      expect(state.version).toBe(1);
      expect(state.belief.authStatus.value).toBe('guest');
      expect(state.belief.activeStage.value).toBe('discovery');
      expect(state.belief.hostilityIndex.value).toBe(0);
      expect(state.belief.isFormPresent.value).toBe(false);
      expect(state.belief.isModalActive.value).toBe(false);
      expect(state.belief.isCheckoutDetect.value).toBe(false);
      expect(state.belief.pageVolatility.value).toBe(0);
      expect(state.reality).toBeNull();
      expect(state.stateConfidence).toBe(1.0);
      expect(state.beliefSourceConsensus).toBe(1.0);
    });

    it('should record version 1 in history', () => {
      const state = service.initializeSession('session-1');
      expect(state.history[1]).toBeDefined();
      expect(state.history[1].reality).toBeNull();
      expect(state.history[1].belief.authStatus).toBe('guest');
    });
  });

  describe('updateReality', () => {
    it('should update reality snapshot', () => {
      service.initializeSession('session-1');
      const snapshot: RealitySnapshot = {
        domHash: 'abc123', screenshotHash: 'img456',
        timestamp: Date.now(), url: 'https://example.com',
      };

      service.updateReality('session-1', snapshot);
      const state = service.getState('session-1');
      expect(state!.reality!.domHash).toBe('abc123');
    });

    it('should be no-op for uninitialized session', () => {
      expect(() => service.updateReality('ghost', {} as any)).not.toThrow();
    });
  });

  describe('updateBelief', () => {
    it('should update belief envelope and increment version', () => {
      const state = service.initializeSession('session-1');

      service.updateBelief('session-1', 'authStatus', 'authenticated', 'NETWORK_PAYLOAD', 0.95);

      const updated = service.getState('session-1');
      expect(updated!.belief.authStatus.value).toBe('authenticated');
      expect(updated!.belief.authStatus.source).toBe('NETWORK_PAYLOAD');
      expect(updated!.belief.authStatus.sourceConfidence).toBe(0.95);
      expect(updated!.version).toBeGreaterThan(1);
    });

    it('should record history entries', () => {
      const state = service.initializeSession('session-1');

      service.updateBelief('session-1', 'authStatus', 'authenticated', 'NETWORK_PAYLOAD', 0.9);
      service.updateBelief('session-1', 'isCheckoutDetect', true, 'VISION_INFERRED', 0.8);

      const updated = service.getState('session-1');
      expect(Object.keys(updated!.history).length).toBe(3); // initial + 2 updates
    });

    it('should set inference depth when provided', () => {
      service.initializeSession('session-1');

      service.updateBelief('session-1', 'hostilityIndex', 0.5, 'VISION_INFERRED', 0.7, 2);

      const state = service.getState('session-1');
      expect(state!.belief.hostilityIndex.inferenceDepth).toBe(2);
    });

    it('should be no-op for uninitialized session', () => {
      expect(() => service.updateBelief('ghost', 'authStatus', 'authenticated', 'DOM_DIRECT', 1.0)).not.toThrow();
    });
  });

  describe('getState', () => {
    it('should return null for uninitialized session', () => {
      expect(service.getState('ghost')).toBeNull();
    });

    it('should return current state for initialized session', () => {
      service.initializeSession('session-1');
      const state = service.getState('session-1');
      expect(state).not.toBeNull();
      expect(state!.sessionId).toBe('session-1');
    });
  });

  describe('rollback', () => {
    it('should restore state to target version', () => {
      service.initializeSession('session-1');
      service.updateBelief('session-1', 'authStatus', 'authenticated', 'NETWORK_PAYLOAD', 0.9);

      const rolledBack = service.rollback('session-1', 1);
      expect(rolledBack).toBe(true);

      const state = service.getState('session-1');
      expect(state!.belief.authStatus.value).toBe('guest');
      expect(state!.version).toBe(1);
      expect(state!.belief.authStatus.source).toBe('USER_ASSERTED');
    });

    it('should return false for non-existent version', () => {
      service.initializeSession('session-1');
      expect(service.rollback('session-1', 999)).toBe(false);
    });

    it('should return false for non-existent session', () => {
      expect(service.rollback('ghost', 1)).toBe(false);
    });
  });

  describe('removeSession', () => {
    it('should remove session state', () => {
      service.initializeSession('session-1');
      service.removeSession('session-1');
      expect(service.getState('session-1')).toBeNull();
    });
  });

  describe('temporal decay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('should decay confidence over time', () => {
      const state = service.initializeSession('session-1');
      expect(state.stateConfidence).toBe(1.0);

      jest.advanceTimersByTime(60000); // 60 seconds

      const decayed = service.getState('session-1');
      expect(decayed!.stateConfidence).toBeLessThan(1.0);
    });

    it('should not let confidence drop below 0.1', () => {
      const state = service.initializeSession('session-1');

      jest.advanceTimersByTime(1000000); // very long time

      const decayed = service.getState('session-1');
      expect(decayed!.stateConfidence).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('consensus calculation', () => {
    it('should detect disagreement between conflicting sources', () => {
      const state = service.initializeSession('session-1');

      service.updateBelief('session-1', 'isCheckoutDetect', true, 'DOM_DIRECT', 0.9);
      service.updateBelief('session-1', 'isFormPresent', false, 'VISION_INFERRED', 0.9);

      const updated = service.getState('session-1');
      expect(updated!.beliefSourceConsensus).toBeLessThanOrEqual(1.0);
    });

    it('should maintain high consensus for non-conflicting beliefs', () => {
      service.initializeSession('session-1');

      service.updateBelief('session-1', 'authStatus', 'authenticated', 'NETWORK_PAYLOAD', 0.95);
      const state = service.getState('session-1');
      expect(state!.beliefSourceConsensus).toBeGreaterThanOrEqual(0.9);
    });
  });
});
