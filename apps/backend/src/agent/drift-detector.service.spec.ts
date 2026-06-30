import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../common/llm/llm.service';
import { DriftDetectorService } from './drift-detector.service';
import { EmbeddingService } from '../common/embedding/embedding.service';

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

const mockLlmService = {
  getClient: jest.fn(() => mockOpenAI),
  available: true,
  chatModel: 'llama-3.3-70b-versatile',
  miniModel: 'llama-3.1-8b-instant',
  visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
};

function makeVector(start: number, dim = 4): number[] {
  return Array.from({ length: dim }, (_, i) => start + i * 0.1);
}

// Real cosine similarity (mirrors EmbeddingService) so drift maths is unchanged.
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

const mockEmbeddingService = {
  generateEmbedding: jest.fn(),
  cosineSimilarity: jest.fn(cosineSimilarity),
};

describe('DriftDetectorService', () => {
  let service: DriftDetectorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmbeddingService.cosineSimilarity.mockImplementation(cosineSimilarity);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriftDetectorService,
        { provide: LlmService, useValue: mockLlmService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
      ],
    }).compile();
    service = module.get<DriftDetectorService>(DriftDetectorService);
  });

  describe('initializeGoal', () => {
    it('should create trajectory state with goal embedding', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValueOnce(makeVector(0));

      await service.initializeGoal('session-1', 'Book a flight to London');

      const result = await service.evaluateDrift('session-1', 'research');
      expect(result.isDrifted).toBe(false);
      expect(result.similarity).toBeCloseTo(1.0, 1);
    });

    it('should handle embedding failure gracefully', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValueOnce([]);

      await expect(service.initializeGoal('session-1', 'Test')).resolves.toBeUndefined();
    });
  });

  describe('recordStep', () => {
    it('should update trajectory vector and be no-op for uninitialized session', async () => {
      await expect(service.recordStep('ghost', 0, 'click', 'Do stuff', 'OK')).resolves.toBeUndefined();
    });

    it('should blend trajectory vector and produce expected similarity', async () => {
      mockEmbeddingService.generateEmbedding
        .mockResolvedValueOnce(makeVector(1)) // goal — pinned vector
        .mockResolvedValueOnce(makeVector(1)); // step — same direction

      await service.initializeGoal('sess-1', 'Buy a laptop');
      await service.recordStep('sess-1', 0, 'navigate', 'Go to Amazon', 'loaded');

      const state = (service as any).trajectories.get('sess-1');
      // Same-direction vectors: blended trajectory should be identical to goal
      const sim = mockEmbeddingService.cosineSimilarity(state.goalEmbedding, state.trajectoryVector);
      expect(sim).toBeCloseTo(1.0, 2);
    });

    it('should handle embedding failure on step', async () => {
      mockEmbeddingService.generateEmbedding
        .mockResolvedValueOnce(makeVector(0)) // goal
        .mockResolvedValueOnce([]); // step

      await service.initializeGoal('session-1', 'Test');
      await expect(service.recordStep('session-1', 1, 'click', 'test', 'OK')).resolves.toBeUndefined();
    });
  });

  describe('evaluateDrift', () => {
    it('should return no-drift for uninitialized session', async () => {
      const result = await service.evaluateDrift('ghost', 'research');
      expect(result.isDrifted).toBe(false);
      expect(result.similarity).toBe(1.0);
      expect(result.type).toBe('EXPLORATION');
    });

    it('should detect drift in strict transaction phase', async () => {
      // Different vector for step = lower similarity
      mockEmbeddingService.generateEmbedding
        .mockResolvedValueOnce(makeVector(0, 4)) // goal
        .mockResolvedValueOnce(makeVector(10, 4)); // step (very different)

      await service.initializeGoal('session-1', 'Buy item');
      await service.recordStep('session-1', 0, 'navigate', 'Go to news site', 'loaded');

      const result = await service.evaluateDrift('session-1', 'transaction');
      expect(result.isDrifted).toBe(true);
    });

    it('should classify drift via LLM when similarity is low', async () => {
      mockEmbeddingService.generateEmbedding
        .mockResolvedValueOnce(makeVector(0, 4)) // goal
        .mockResolvedValueOnce(makeVector(10, 4)); // step

      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '{"type":"DISTRACTION","reasoning":"Off-topic navigation"}' } }],
      });

      await service.initializeGoal('session-1', 'Buy item');
      await service.recordStep('session-1', 0, 'navigate', 'Visit unrelated blog', 'loaded');

      const result = await service.evaluateDrift('session-1', 'transaction');
      expect(result.isDrifted).toBe(true);
      expect(result.type).toBe('DISTRACTION');
    });

    it('should classify as EXPLORATION when LLM returns that type', async () => {
      mockEmbeddingService.generateEmbedding
        .mockResolvedValueOnce(makeVector(0, 4)) // goal
        .mockResolvedValueOnce(makeVector(10, 4)); // step

      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '{"type":"EXPLORATION","reasoning":"Looking for product info on review sites"}' } }],
      });

      await service.initializeGoal('session-1', 'Buy item');
      await service.recordStep('session-1', 0, 'navigate', 'Read review', 'loaded');

      const result = await service.evaluateDrift('session-1', 'transaction');
      expect(result.isDrifted).toBe(true);
      expect(result.type).toBe('EXPLORATION');
    });

    it('should default to DISTRACTION on LLM failure', async () => {
      mockEmbeddingService.generateEmbedding
        .mockResolvedValueOnce(makeVector(0, 4)) // goal
        .mockResolvedValueOnce(makeVector(10, 4)); // step

      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('LLM error'));

      await service.initializeGoal('session-1', 'Buy item');
      await service.recordStep('session-1', 0, 'navigate', 'Off-topic', 'loaded');

      const result = await service.evaluateDrift('session-1', 'transaction');
      expect(result.isDrifted).toBe(true);
      expect(result.type).toBe('DISTRACTION');
    });

    it('should handle empty LLM response', async () => {
      mockEmbeddingService.generateEmbedding
        .mockResolvedValueOnce(makeVector(0, 4)) // goal
        .mockResolvedValueOnce(makeVector(10, 4)); // step

      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
      });

      await service.initializeGoal('session-1', 'Buy item');
      await service.recordStep('session-1', 0, 'navigate', 'Off-topic', 'loaded');

      const result = await service.evaluateDrift('session-1', 'transaction');
      expect(result.isDrifted).toBe(true);
      expect(result.type).toBe('DISTRACTION');
    });
  });

  describe('clearSession', () => {
    it('should remove session trajectory state', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValueOnce(makeVector(0));

      await service.initializeGoal('session-1', 'Test');
      service.clearSession('session-1');

      const result = await service.evaluateDrift('session-1', 'research');
      expect(result.isDrifted).toBe(false);
    });
  });
});
