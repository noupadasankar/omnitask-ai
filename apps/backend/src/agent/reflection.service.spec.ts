import { Test, TestingModule } from '@nestjs/testing';
import { ReflectionService } from './reflection.service';
import { LlmService } from '../common/llm/llm.service';
import { MemoryStoreService } from './memory-store.service';
import { ParsedGoal } from './goal-understanding.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';

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

/** Flush all pending setImmediate callbacks (and their awaited microtasks). */
function flushImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ReflectionService', () => {
  let service: ReflectionService;
  let memoryStore: jest.Mocked<Pick<MemoryStoreService, 'store'>>;

  const parsedGoal: ParsedGoal = {
    taskType: 'shopping',
    intent: 'Buy a product',
    entities: {},
    constraints: [],
    preferredWebsites: ['amazon.in'],
    estimatedComplexity: 'moderate',
    requiresPayment: false,
    requiresLogin: false,
    sensitiveData: false,
    ambiguityScore: 0.2,
    clarifyingQuestions: [],
    confidence: 0.8,
  };
  const plan: AgentPlan = {
    taskId: 'task-1',
    goal: 'Test goal',
    steps: [
      { index: 0, action: 'navigate', description: 'Go to site', riskLevel: 'LOW', requiresApproval: false },
      { index: 1, action: 'click', description: 'Click button', riskLevel: 'LOW', requiresApproval: false },
    ],
    estimatedDuration: 60,
    riskAssessment: { overallRisk: 'LOW', reasons: [], requiresUserApproval: false },
  };
  const results = [{ success: true }, { success: false, error: 'Not found' }];
  const errorHistory = ['Step 1: Not found'];

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryStore = { store: jest.fn().mockResolvedValue(undefined) } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReflectionService,
        { provide: LlmService, useValue: mockLlmService },
        { provide: MemoryStoreService, useValue: memoryStore },
      ],
    }).compile();
    service = module.get<ReflectionService>(ReflectionService);
  });

  describe('reflect', () => {
    it('should queue post-run reflection via setImmediate and call LLM', async () => {
      const reflectionResult = {
        didSucceed: false,
        mismatchedAssumptions: [],
        optimalPathDiscovered: null,
        failedSelectors: ['#submit-btn'],
        recommendedPromptCorrection: 'Use more specific selectors',
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(reflectionResult) } }],
      });

      service.reflect('session-1', 'user-1', 'Test goal', parsedGoal, plan, results, errorHistory, false);
      await flushImmediate();

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
      expect(memoryStore.store).toHaveBeenCalled();
    });

    it('should store negative invariant for each failed selector', async () => {
      const reflectionResult = {
        didSucceed: false,
        mismatchedAssumptions: [],
        optimalPathDiscovered: null,
        failedSelectors: ['#submit-btn'],
        recommendedPromptCorrection: '',
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(reflectionResult) } }],
      });

      service.reflect('session-1', 'user-1', 'Test goal', parsedGoal, plan, results, errorHistory, false);
      await flushImmediate();

      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1',
        'SEMANTIC',
        expect.stringContaining('negative_invariant:shopping:amazon.in:'),
        expect.any(String),
        0.6,
        undefined,
        expect.objectContaining({
          strategyType: 'negative_invariant',
          failedSelector: '#submit-btn',
        }),
      );
    });

    it('should store optimal shortcut when successful and path found', async () => {
      const reflectionResult = {
        didSucceed: true,
        mismatchedAssumptions: [],
        optimalPathDiscovered: 'Use direct URL parameters instead of clicking',
        failedSelectors: [],
        recommendedPromptCorrection: 'Skip unnecessary clicks',
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(reflectionResult) } }],
      });

      service.reflect('session-1', 'user-1', 'Test goal', parsedGoal, plan, [], [], true);
      await flushImmediate();

      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1',
        'SEMANTIC',
        expect.stringContaining('optimal_shortcut:shopping:'),
        expect.any(String),
        0.75,
        undefined,
        expect.objectContaining({ strategyType: 'optimal_shortcut' }),
      );
    });

    it('should not persist when LLM returns empty content (fallback reflection has no selectors)', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      service.reflect('session-1', 'user-1', 'buy something', parsedGoal, plan, [], [], false);
      await flushImmediate();

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
      // Fallback has empty failedSelectors and optimalPathDiscovered=null → no store calls
      expect(memoryStore.store).not.toHaveBeenCalled();
    });

    it('should handle LLM failure gracefully without persisting', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      service.reflect('session-1', 'user-1', 'Test goal', parsedGoal, plan, results, errorHistory, false);
      await flushImmediate();

      expect(memoryStore.store).not.toHaveBeenCalled();
    });

    it('should handle memoryStore.store failure gracefully (per selector)', async () => {
      const reflectionResult = {
        didSucceed: false,
        mismatchedAssumptions: [],
        optimalPathDiscovered: null,
        failedSelectors: ['#btn'],
        recommendedPromptCorrection: '',
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(reflectionResult) } }],
      });
      memoryStore.store.mockRejectedValueOnce(new Error('store error'));

      // Should not throw
      service.reflect('session-1', 'user-1', 'Test goal', parsedGoal, plan, results, errorHistory, false);
      await flushImmediate();

      expect(memoryStore.store).toHaveBeenCalled();
    });
  });
});
