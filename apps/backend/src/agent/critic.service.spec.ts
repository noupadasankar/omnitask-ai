import { Test, TestingModule } from '@nestjs/testing';
import { CriticService } from './critic.service';
import { LlmService } from '../common/llm/llm.service';

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

describe('CriticService', () => {
  let service: CriticService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CriticService,
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();
    service = module.get<CriticService>(CriticService);
  });

  describe('evaluate', () => {
    const plan = { goal: 'Test goal', steps: [{ action: 'navigate', description: 'Go to page', riskLevel: 'LOW' }] };

    it('should return LLM critique when API succeeds', async () => {
      const llmResult = {
        passed: true,
        score: 85,
        feedback: 'Good execution',
        suggestions: ['Add more wait conditions'],
        qualityDimensions: { accuracy: 90, completeness: 80, efficiency: 85, safety: 95 },
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResult) } }],
      });

      const result = await service.evaluate(plan, [{ success: true }]);
      expect(result).toEqual(llmResult);
    });

    it('should pass when score >= 70', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ score: 75, feedback: 'ok', suggestions: [], qualityDimensions: { accuracy: 75, completeness: 75, efficiency: 70, safety: 80 } }) } }],
      });

      const result = await service.evaluate(plan, [{ success: true }]);
      expect(result.passed).toBe(true);
    });

    it('should fail when score < 70', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ score: 55, feedback: 'bad', suggestions: [], qualityDimensions: { accuracy: 50, completeness: 60, efficiency: 50, safety: 70 } }) } }],
      });

      const result = await service.evaluate(plan, [{ success: true }]);
      expect(result.passed).toBe(false);
    });

    it('should clamp score to 0-100 range', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ score: 150, feedback: 'over', suggestions: [], qualityDimensions: { accuracy: 100, completeness: 100, efficiency: 100, safety: 100 } }) } }],
      });

      const result = await service.evaluate(plan, [{ success: true }]);
      expect(result.score).toBe(100);
    });

    it('should use fallback critique when LLM call fails', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const twoStepPlan = {
        goal: 'Test goal',
        steps: [
          { action: 'navigate', description: 'Go to page', riskLevel: 'LOW' as const },
          { action: 'click', description: 'Click button', riskLevel: 'LOW' as const },
        ],
      };
      const result = await service.evaluate(twoStepPlan, [{ success: true }, { success: false }]);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(50);
      expect(result.feedback).toContain('below threshold');
    });

    it('should use fallback critique on empty LLM response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await service.evaluate(plan, [{ success: true }]);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('should compute completion rate for fallback', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const result = await service.evaluate(
        { goal: 'test', steps: [{ action: 'click' }, { action: 'type' }, { action: 'submit' }] },
        [{ success: true }, { success: false }, { success: true }],
      );
      expect(result.score).toBe(67);
    });

    it('should return safety dimension as 95 in fallback', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const result = await service.evaluate(plan, [{ success: true }]);
      expect(result.qualityDimensions.safety).toBe(95);
    });
  });
});
