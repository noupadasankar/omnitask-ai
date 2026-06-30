import { Test, TestingModule } from '@nestjs/testing';
import { ConfidenceNetworkService } from './confidence-network.service';

describe('ConfidenceNetworkService', () => {
  let service: ConfidenceNetworkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfidenceNetworkService],
    }).compile();
    service = module.get<ConfidenceNetworkService>(ConfidenceNetworkService);
  });

  describe('initializeSession', () => {
    it('should create empty CPN for session', () => {
      service.initializeSession('session-1');
      const result = service.computeSystemConfidence('session-1');
      expect(result.systemConfidence).toBe(1.0);
      expect(result.nodeCount).toBe(0);
    });
  });

  describe('recordConfidence', () => {
    it('should record a confidence reading for a source', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.9, 1.2);

      const result = service.computeSystemConfidence('session-1');
      expect(result.nodeCount).toBe(1);
      expect(result.weakestNode?.source).toBe('planner');
    });

    it('should clamp confidence to valid range', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0);
      const result = service.computeSystemConfidence('session-1');
      expect(result.weakestNode!.confidence).toBeGreaterThan(0);
    });

    it('should replace previous reading for same source', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.5, 1.0);
      service.recordConfidence('session-1', 'planner', 0.95, 1.0);

      const result = service.computeSystemConfidence('session-1');
      expect(result.nodeCount).toBe(1);
      expect(result.weakestNode!.confidence).toBeGreaterThan(0.9);
    });

    it('should be no-op for uninitialized session', () => {
      expect(() => service.recordConfidence('ghost', 'planner', 0.9)).not.toThrow();
    });
  });

  describe('computeSystemConfidence', () => {
    it('should return 1.0 when no nodes exist for uninitialized session', () => {
      const result = service.computeSystemConfidence('ghost');
      expect(result.systemConfidence).toBe(1.0);
      expect(result.nodeCount).toBe(0);
    });

    it('should compute weighted geometric mean over multiple sources', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.9, 1.0);
      service.recordConfidence('session-1', 'drift', 0.8, 1.0);
      service.recordConfidence('session-1', 'verifier', 0.85, 2.0);

      const result = service.computeSystemConfidence('session-1');
      expect(result.systemConfidence).toBeGreaterThan(0);
      expect(result.systemConfidence).toBeLessThan(1);
      expect(result.nodeCount).toBe(3);
      expect(result.compositeBreakdown).toHaveLength(3);
    });
  });

  describe('getThresholds', () => {
    it('should return conservative thresholds', () => {
      const t = service.getThresholds('conservative');
      expect(t.abortThreshold).toBe(0.35);
      expect(t.pauseThreshold).toBe(0.55);
    });

    it('should return balanced thresholds as default', () => {
      const t = service.getThresholds('balanced');
      expect(t.abortThreshold).toBe(0.20);
    });

    it('should default to balanced for unknown profile', () => {
      const t = service.getThresholds('unknown' as any);
      expect(t.abortThreshold).toBe(0.20);
    });
  });

  describe('evaluateGate', () => {
    it('should return proceed for high confidence', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.95, 1.0);

      const gate = service.evaluateGate('session-1', 'conservative');
      expect(gate.decision).toBe('proceed');
    });

    it('should return abort for very low confidence', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.01, 1.0);

      const gate = service.evaluateGate('session-1', 'conservative');
      expect(gate.decision).toBe('abort');
    });

    it('should return warn for moderate-low confidence', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.55, 1.0);

      const gate = service.evaluateGate('session-1', 'balanced');
      expect(gate.decision).toBe('warn');
    });

    it('should include threshold info in result', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.5, 1.0);

      const gate = service.evaluateGate('session-1', 'balanced');
      expect(gate.thresholds).toBeDefined();
      expect(gate.reasoning).toContain('balanced');
    });

    it('should identify weakest node', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.9, 1.0);
      service.recordConfidence('session-1', 'drift', 0.3, 1.0);

      const gate = service.evaluateGate('session-1', 'balanced');
      expect(gate.weakestNode?.source).toBe('drift');
    });
  });

  describe('clearSession', () => {
    it('should remove session CPN data', () => {
      service.initializeSession('session-1');
      service.recordConfidence('session-1', 'planner', 0.9);
      service.clearSession('session-1');

      const result = service.computeSystemConfidence('session-1');
      expect(result.nodeCount).toBe(0);
    });
  });
});
