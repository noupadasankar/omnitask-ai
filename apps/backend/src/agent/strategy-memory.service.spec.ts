// backend/src/agent/strategy-memory.service.spec.ts
//
// Full coverage for StrategyMemoryService, including:
//   - storeStrategy  → routes through MemoryStoreService.store(), never directly to prisma.agentMemory
//   - getRelevantStrategies → filtered by goalType / category
//   - updateStrategyOutcome → memoryStore.touchAccess() called inside recallStrategies
//   - explicit assertion that prisma.agentMemory.create / upsert are never called for writes

import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../common/llm/llm.service';
import { StrategyMemoryService, StrategyPattern, RecalledStrategy } from './strategy-memory.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../common/embedding/embedding.service';
import { MemoryStoreService } from './memory-store.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Returns a simple float vector starting at `start` with the given dimension. */
function makeVector(start: number, dim = 4): number[] {
  return Array.from({ length: dim }, (_, i) => start + i * 0.1);
}

/** Real cosine-similarity so recall ranking tests are deterministic. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 0;
  let dot = 0, magA = 0, magB = 0;
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

/** Build a minimal valid StrategyPattern JSON string. */
function makePatternJson(overrides: Partial<StrategyPattern> = {}): string {
  return JSON.stringify({
    goalType: 'research',
    domain: 'e-commerce',
    effectiveApproach: 'Used search and compare',
    effectiveSites: ['amazon.com'],
    sitesToAvoid: [],
    avgSteps: 3,
    skillsUsed: ['search', 'compare'],
    successRate: 1.0,
    notes: 'Works well',
    ...overrides,
  } as StrategyPattern);
}

/** Build a raw prisma agentMemory row with a given embedding + content. */
function makeMemoryRow(id: string, embedding: number[], content: string, goalType = 'research', importance = 0.85) {
  return { id, key: `strategy:${goalType}:${id}`, content, embedding, importance, metadata: { goalType } };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PARSED_GOAL_RESEARCH = {
  taskType: 'research',
  intent: 'find best laptop',
  entities: { domain: 'e-commerce' },
  preferredWebsites: ['amazon.com', 'bestbuy.com'],
};

const PARSED_GOAL_BOOKING = {
  taskType: 'booking',
  intent: 'book a flight',
  entities: { domain: 'travel' },
  preferredWebsites: ['kayak.com', 'expedia.com'],
};

const MOCK_PLAN = {
  taskId: 'task-1',
  goal: 'Find best laptop',
  estimatedDuration: 60,
  steps: [
    {
      index: 0,
      action: 'navigate' as const,
      value: 'https://amazon.com',
      description: 'Go to Amazon',
      riskLevel: 'LOW' as const,
      requiresApproval: false,
    },
  ],
  skillsUsed: ['search', 'compare'],
  riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('StrategyMemoryService', () => {
  let service: StrategyMemoryService;
  let prisma: {
    agentMemory: {
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let memoryStore: jest.Mocked<Pick<MemoryStoreService, 'store' | 'touchAccess'>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default embedding: a simple vector close to itself
    mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
    mockEmbeddingService.cosineSimilarity.mockImplementation(cosineSimilarity);

    // Prisma mock — we also add create/upsert so we can assert they are NOT called
    prisma = {
      agentMemory: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };

    memoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      touchAccess: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategyMemoryService,
        { provide: LlmService, useValue: mockLlmService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: PrismaService, useValue: prisma },
        { provide: MemoryStoreService, useValue: memoryStore },
      ],
    }).compile();

    service = module.get<StrategyMemoryService>(StrategyMemoryService);
  });

  // -------------------------------------------------------------------------
  // storeStrategy — routes through MemoryStoreService, not direct prisma writes
  // -------------------------------------------------------------------------

  describe('storeStrategy (storeSuccessfulStrategy)', () => {
    it('stores strategy through MemoryStoreService.store() — not via prisma.agentMemory directly', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Find best laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      // MemoryStoreService.store MUST have been called
      expect(memoryStore.store).toHaveBeenCalledTimes(1);

      // prisma.agentMemory.create and .upsert must NOT be called (no direct write)
      expect(prisma.agentMemory.create).not.toHaveBeenCalled();
      expect(prisma.agentMemory.upsert).not.toHaveBeenCalled();
    });

    it('stores with CANDIDATE importance (0.50) when fewer than 2 strategies exist for this goalType', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockResolvedValue(1); // < 2

      await service.storeSuccessfulStrategy('user-1', 'Find best laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1',
        'SEMANTIC',
        expect.stringMatching(/^strategy:research:/),
        expect.any(String),
        0.50,
        undefined,
        expect.objectContaining({ isCandidate: true, goalType: 'research' }),
      );
    });

    it('stores with PROMOTED importance (0.85) when 2+ strategies exist for this goalType', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockResolvedValue(2); // exactly 2 → promoted

      await service.storeSuccessfulStrategy('user-1', 'Find best laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1',
        'SEMANTIC',
        expect.any(String),
        expect.any(String),
        0.85,
        undefined,
        expect.objectContaining({ isCandidate: false }),
      );
    });

    it('uses fallback pattern (no LLM call) when LLM throws', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('LLM timeout'));
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Find best laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 45_000);

      expect(memoryStore.store).toHaveBeenCalledTimes(1);
      const storedContent = JSON.parse((memoryStore.store as jest.Mock).mock.calls[0][3]);
      expect(storedContent.goalType).toBe('research');
      expect(storedContent.domain).toBe('general'); // fallback domain
      expect(storedContent.successRate).toBe(1.0);
    });

    it('key encodes goalType: strategy:<taskType>:<timestamp>', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson({ goalType: 'booking' }) } }],
      });
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Book a flight', PARSED_GOAL_BOOKING as any, MOCK_PLAN as any, 20_000);

      const [, , key] = (memoryStore.store as jest.Mock).mock.calls[0];
      expect(key).toMatch(/^strategy:booking:\d+$/);
    });

    it('handles prisma.count failure gracefully and does not throw', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockRejectedValueOnce(new Error('DB down'));

      await expect(
        service.storeSuccessfulStrategy('user-1', 'Test', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 1_000),
      ).resolves.toBeUndefined();
    });

    it('stores metadata.strategyType as execution_pattern', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Find best laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      const metadata = (memoryStore.store as jest.Mock).mock.calls[0][6];
      expect(metadata.strategyType).toBe('execution_pattern');
    });

    it('stores domain from extracted LLM pattern in metadata', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson({ domain: 'job-search' }) } }],
      });
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Find jobs', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      const metadata = (memoryStore.store as jest.Mock).mock.calls[0][6];
      expect(metadata.domain).toBe('job-search');
    });
  });

  // -------------------------------------------------------------------------
  // storeFailurePattern
  // -------------------------------------------------------------------------

  describe('storeFailurePattern', () => {
    it('does nothing when errorHistory is empty (no store call)', async () => {
      await service.storeFailurePattern('user-1', 'goal', PARSED_GOAL_RESEARCH as any, [], 0);
      expect(memoryStore.store).not.toHaveBeenCalled();
    });

    it('routes through MemoryStoreService.store() — not via prisma.agentMemory directly', async () => {
      await service.storeFailurePattern('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, ['Timeout'], 2);
      expect(memoryStore.store).toHaveBeenCalledTimes(1);
      expect(prisma.agentMemory.create).not.toHaveBeenCalled();
      expect(prisma.agentMemory.upsert).not.toHaveBeenCalled();
    });

    it('stores with key failure:<goalType>:<timestamp>', async () => {
      await service.storeFailurePattern('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, ['Error A'], 3);
      const [, , key] = (memoryStore.store as jest.Mock).mock.calls[0];
      expect(key).toMatch(/^failure:research:\d+$/);
    });

    it('stores with importance 0.7 and strategyType failure_pattern', async () => {
      await service.storeFailurePattern('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, ['Error A', 'Error B'], 2);
      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1',
        'SEMANTIC',
        expect.stringMatching(/^failure:research:/),
        expect.any(String),
        0.7,
        undefined,
        expect.objectContaining({ strategyType: 'failure_pattern', goalType: 'research' }),
      );
    });

    it('only includes the last 3 errors in content', async () => {
      const errors = ['e1', 'e2', 'e3', 'e4', 'e5'];
      await service.storeFailurePattern('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, errors, 5);
      const content = JSON.parse((memoryStore.store as jest.Mock).mock.calls[0][3]);
      expect(content.failureReasons).toEqual(['e3', 'e4', 'e5']);
    });
  });

  // -------------------------------------------------------------------------
  // getRelevantStrategies — filtered by category (goalType)
  // -------------------------------------------------------------------------

  describe('getRelevantStrategies (recallStrategies)', () => {
    it('returns empty array when prisma finds no matching memories', async () => {
      prisma.agentMemory.findMany.mockResolvedValue([]);
      const result = await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any);
      expect(result).toEqual([]);
    });

    it('queries prisma with execution_pattern strategyType filter (category filter)', async () => {
      prisma.agentMemory.findMany.mockResolvedValue([]);
      await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any);

      expect(prisma.agentMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'SEMANTIC',
            metadata: expect.objectContaining({ path: ['strategyType'], string_contains: 'execution_pattern' }),
          }),
        }),
      );
    });

    it('queries only for the requesting userId (category isolation)', async () => {
      prisma.agentMemory.findMany.mockResolvedValue([]);
      await service.recallStrategies('user-42', PARSED_GOAL_RESEARCH as any);
      const { where } = (prisma.agentMemory.findMany as jest.Mock).mock.calls[0][0];
      expect(where.userId).toBe('user-42');
    });

    it('returns strategies sorted by cosine similarity descending', async () => {
      // queryEmbedding = makeVector(0) = [0, 0.1, 0.2, 0.3]
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));

      // m1 embedding very close to query; m2 further away
      const closeEmbedding = makeVector(0.01);  // nearly identical → very high similarity
      const farEmbedding = makeVector(5);        // very different direction

      prisma.agentMemory.findMany.mockResolvedValue([
        makeMemoryRow('m1', closeEmbedding, makePatternJson({ domain: 'close' })),
        makeMemoryRow('m2', farEmbedding, makePatternJson({ domain: 'far' })),
      ]);
      prisma.agentMemory.update.mockResolvedValue({});

      const result = await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any, 3);

      // m1 should come first (higher similarity)
      expect(result[0].pattern.domain).toBe('close');
      if (result.length > 1) {
        expect(result[0].relevanceScore).toBeGreaterThan(result[1].relevanceScore);
      }
    });

    it('filters out memories with similarity <= 0.5', async () => {
      // queryEmbedding = [0, 0.1, 0.2, 0.3]
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));

      // Orthogonal vector: all-zero embedding → cosine similarity = 0
      const orthogonalEmbedding = [0, 0, 0, 0];
      prisma.agentMemory.findMany.mockResolvedValue([
        makeMemoryRow('m1', orthogonalEmbedding, makePatternJson({ domain: 'filtered-out' })),
      ]);
      prisma.agentMemory.update.mockResolvedValue({});

      const result = await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any, 3);
      expect(result).toEqual([]);
    });

    it('respects the limit parameter', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
      // 5 near-identical rows → all pass similarity filter
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeMemoryRow(`m${i}`, makeVector(0.01 + i * 0.001), makePatternJson({ domain: `domain-${i}` })),
      );
      prisma.agentMemory.findMany.mockResolvedValue(rows);
      prisma.agentMemory.update.mockResolvedValue({});

      const result = await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any, 2);
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('skips malformed JSON memory entries without throwing', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
      prisma.agentMemory.findMany.mockResolvedValue([
        makeMemoryRow('m1', makeVector(0.01), 'NOT_VALID_JSON'),
      ]);
      prisma.agentMemory.update.mockResolvedValue({});

      const result = await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any);
      expect(result).toEqual([]);
    });

    it('returns empty array on DB failure without throwing', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
      prisma.agentMemory.findMany.mockRejectedValueOnce(new Error('Connection lost'));

      const result = await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any);
      expect(result).toEqual([]);
    });

    it('each recalled strategy carries a relevanceScore between 0 and 1', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
      prisma.agentMemory.findMany.mockResolvedValue([
        makeMemoryRow('m1', makeVector(0.01), makePatternJson()),
      ]);
      prisma.agentMemory.update.mockResolvedValue({});

      const result = await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any, 3);
      for (const r of result) {
        expect(r.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(r.relevanceScore).toBeLessThanOrEqual(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // updateStrategyOutcome — memoryStore.touchAccess() inside recallStrategies
  // -------------------------------------------------------------------------

  describe('updateStrategyOutcome (access-count bump inside recallStrategies)', () => {
    it('calls memoryStore.touchAccess for each recalled strategy to increment accessCount', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));

      const closeEmbedding = makeVector(0.01);
      prisma.agentMemory.findMany.mockResolvedValue([
        makeMemoryRow('m1', closeEmbedding, makePatternJson({ domain: 'tech' })),
        makeMemoryRow('m2', closeEmbedding, makePatternJson({ domain: 'health' })),
      ]);

      await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any, 5);

      // touchAccess called once per recalled memory
      expect(memoryStore.touchAccess).toHaveBeenCalledTimes(2);
      expect(prisma.agentMemory.update).not.toHaveBeenCalled();
    });

    it('passes the correct memory id to touchAccess', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
      prisma.agentMemory.findMany.mockResolvedValue([
        makeMemoryRow('m1', makeVector(0.01), makePatternJson()),
      ]);

      await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any, 3);

      expect(memoryStore.touchAccess).toHaveBeenCalledWith('m1');
    });

    it('does not call memoryStore.touchAccess when no strategies pass the similarity threshold', async () => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
      prisma.agentMemory.findMany.mockResolvedValue([
        makeMemoryRow('m1', [0, 0, 0, 0], makePatternJson()), // zero vector → similarity = 0
      ]);

      await service.recallStrategies('user-1', PARSED_GOAL_RESEARCH as any, 3);
      expect(memoryStore.touchAccess).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // No direct prisma.agentMemory writes during storage operations
  // -------------------------------------------------------------------------

  describe('no direct prisma.agentMemory writes during store operations', () => {
    it('storeSuccessfulStrategy never calls prisma.agentMemory.create', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      expect(prisma.agentMemory.create).not.toHaveBeenCalled();
    });

    it('storeSuccessfulStrategy never calls prisma.agentMemory.upsert', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      expect(prisma.agentMemory.upsert).not.toHaveBeenCalled();
    });

    it('storeFailurePattern never calls prisma.agentMemory.create', async () => {
      await service.storeFailurePattern('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, ['Err'], 1);
      expect(prisma.agentMemory.create).not.toHaveBeenCalled();
    });

    it('storeFailurePattern never calls prisma.agentMemory.upsert', async () => {
      await service.storeFailurePattern('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, ['Err'], 1);
      expect(prisma.agentMemory.upsert).not.toHaveBeenCalled();
    });

    it('all writes go through memoryStore.store (exactly one call per store operation)', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: makePatternJson() } }],
      });
      prisma.agentMemory.count.mockResolvedValue(0);

      await service.storeSuccessfulStrategy('user-1', 'Find laptop', PARSED_GOAL_RESEARCH as any, MOCK_PLAN as any, 30_000);

      expect(memoryStore.store).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // formatStrategiesForPlanner
  // -------------------------------------------------------------------------

  describe('formatStrategiesForPlanner', () => {
    it('returns empty string for an empty strategies array', () => {
      expect(service.formatStrategiesForPlanner([])).toBe('');
    });

    it('includes the RECALLED EXECUTION STRATEGIES header', () => {
      const strategies: RecalledStrategy[] = [
        {
          pattern: {
            goalType: 'research', domain: 'tech',
            effectiveApproach: 'Search Amazon', effectiveSites: ['amazon.com'],
            sitesToAvoid: [], avgSteps: 5, skillsUsed: ['search'], successRate: 1.0, notes: 'Good',
          },
          relevanceScore: 0.92,
          memoryKey: 'strategy:research:1',
        },
      ];
      const result = service.formatStrategiesForPlanner(strategies);
      expect(result).toContain('RECALLED EXECUTION STRATEGIES');
    });

    it('includes relevance percentage for each strategy', () => {
      const strategies: RecalledStrategy[] = [
        {
          pattern: {
            goalType: 'research', domain: 'tech',
            effectiveApproach: 'Search Amazon', effectiveSites: ['amazon.com'],
            sitesToAvoid: [], avgSteps: 5, skillsUsed: ['search'], successRate: 1.0, notes: 'Good',
          },
          relevanceScore: 0.75,
          memoryKey: 'strategy:research:1',
        },
      ];
      const result = service.formatStrategiesForPlanner(strategies);
      expect(result).toContain('75%');
    });

    it('renders effectiveApproach and effectiveSites into the output', () => {
      const strategies: RecalledStrategy[] = [
        {
          pattern: {
            goalType: 'research', domain: 'tech',
            effectiveApproach: 'Navigate directly to product pages', effectiveSites: ['amazon.com', 'newegg.com'],
            sitesToAvoid: ['ebay.com'], avgSteps: 4, skillsUsed: ['browse'], successRate: 1.0, notes: 'Fast',
          },
          relevanceScore: 0.88,
          memoryKey: 'strategy:research:2',
        },
      ];
      const result = service.formatStrategiesForPlanner(strategies);
      expect(result).toContain('Navigate directly to product pages');
      expect(result).toContain('amazon.com');
      expect(result).toContain('newegg.com');
    });

    it('includes sitesToAvoid in the output', () => {
      const strategies: RecalledStrategy[] = [
        {
          pattern: {
            goalType: 'research', domain: 'tech',
            effectiveApproach: 'Direct search', effectiveSites: ['amazon.com'],
            sitesToAvoid: ['craigslist.com'], avgSteps: 3, skillsUsed: ['search'], successRate: 1.0, notes: '',
          },
          relevanceScore: 0.80,
          memoryKey: 'strategy:research:3',
        },
      ];
      const result = service.formatStrategiesForPlanner(strategies);
      expect(result).toContain('craigslist.com');
    });

    it('renders multiple strategies with numbered headings', () => {
      const makeStrategy = (n: number): RecalledStrategy => ({
        pattern: {
          goalType: 'research', domain: `domain-${n}`,
          effectiveApproach: `Approach ${n}`, effectiveSites: [], sitesToAvoid: [],
          avgSteps: n, skillsUsed: [], successRate: 1.0, notes: '',
        },
        relevanceScore: 1 - n * 0.1,
        memoryKey: `strategy:research:${n}`,
      });

      const result = service.formatStrategiesForPlanner([makeStrategy(1), makeStrategy(2), makeStrategy(3)]);
      expect(result).toContain('Strategy 1');
      expect(result).toContain('Strategy 2');
      expect(result).toContain('Strategy 3');
    });
  });
});
