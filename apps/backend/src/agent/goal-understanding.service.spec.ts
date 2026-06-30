import { Test, TestingModule } from '@nestjs/testing';
import { GoalUnderstandingService } from './goal-understanding.service';
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

describe('GoalUnderstandingService', () => {
  let service: GoalUnderstandingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalUnderstandingService,
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();
    service = module.get<GoalUnderstandingService>(GoalUnderstandingService);
  });

  describe('parseGoal', () => {
    it('should parse a goal via LLM into structured result', async () => {
      const llmResult = {
        taskType: 'food_order',
        intent: 'Order pizza from Dominos',
        entities: { item: 'pizza', restaurant: 'Dominos' },
        constraints: ['budget under 500'],
        preferredWebsites: ['dominos.in'],
        estimatedComplexity: 'simple',
        requiresPayment: true,
        requiresLogin: true,
        sensitiveData: false,
        ambiguityScore: 0.2,
        clarifyingQuestions: [],
        confidence: 0.9,
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResult) } }],
      });

      const result = await service.parseGoal('Order pizza from Dominos under 500');

      expect(result.taskType).toBe('food_order');
      expect(result.entities.item).toBe('pizza');
      expect(result.ambiguityScore).toBe(0.2);
      expect(result.confidence).toBe(0.9);
    });

    it('should provide clarifying questions for ambiguous goals', async () => {
      const llmResult = {
        taskType: 'general',
        intent: 'Help me with work',
        entities: {},
        constraints: [],
        preferredWebsites: [],
        estimatedComplexity: 'complex',
        requiresPayment: false,
        requiresLogin: false,
        sensitiveData: false,
        ambiguityScore: 0.85,
        clarifyingQuestions: ['What type of work?', 'Any specific tools?'],
        confidence: 0.3,
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResult) } }],
      });

      const result = await service.parseGoal('Help me with work');

      expect(result.ambiguityScore).toBeGreaterThan(0.6);
      expect(result.clarifyingQuestions.length).toBeGreaterThan(0);
    });

    it('should use heuristic parser when LLM is unavailable', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const result = await service.parseGoal('I want to apply for jobs on LinkedIn');

      expect(result.taskType).toBe('job_search');
      expect(result.ambiguityScore).toBe(0.3);
      expect(result.confidence).toBe(0.55);
    });

    it('should use heuristic parser when LLM returns empty content', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await service.parseGoal('Order food from Swiggy');
      expect(result.taskType).toBe('food_order');
    });

    it('should handle user context memories and preferences', async () => {
      const llmResult = {
        taskType: 'shopping',
        intent: 'Buy a shirt',
        entities: { item: 'shirt' },
        constraints: [],
        preferredWebsites: ['amazon.in'],
        estimatedComplexity: 'simple',
        requiresPayment: true,
        requiresLogin: false,
        sensitiveData: false,
        ambiguityScore: 0.3,
        clarifyingQuestions: [],
        confidence: 0.8,
      };
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResult) } }],
      });

      const result = await service.parseGoal('Buy a shirt', {
        memories: ['Prefers Amazon'],
        preferences: { size: 'M' },
      });

      expect(result.taskType).toBe('shopping');
    });

    it('should fall back to heuristic when no API key', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GoalUnderstandingService,
          { provide: LlmService, useValue: { ...mockLlmService, available: false } },
        ],
      }).compile();
      const svc = module.get<GoalUnderstandingService>(GoalUnderstandingService);

      const result = await svc.parseGoal('Play some music');
      expect(result.taskType).toBe('music_play');
    });

    it('should detect email intent from heuristic', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));
      const result = await service.parseGoal('Send an email to john@example.com');
      expect(result.taskType).toBe('email_send');
    });

    it('should detect research intent from heuristic', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));
      const result = await service.parseGoal('Research the latest AI trends');
      expect(result.taskType).toBe('research');
    });

    it('should detect travel intent from heuristic', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));
      const result = await service.parseGoal('Book a flight to Delhi');
      expect(result.taskType).toBe('flight_search');
    });

    it('should default to general for unknown intent', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));
      const result = await service.parseGoal('What is the meaning of life?');
      expect(result.taskType).toBe('general');
    });
  });

  describe('refineGoal', () => {
    it('should refine goal with user feedback via LLM', async () => {
      const currentGoal = {
        taskType: 'general',
        intent: 'Book something',
        entities: {},
        constraints: [],
        preferredWebsites: [],
        estimatedComplexity: 'moderate' as const,
        requiresPayment: false,
        requiresLogin: false,
        sensitiveData: false,
        ambiguityScore: 0.8,
        clarifyingQuestions: ['What to book?'],
        confidence: 0.4,
      };

      const refinedGoal = {
        ...currentGoal,
        taskType: 'hotel_booking',
        ambiguityScore: 0.2,
        clarifyingQuestions: [],
        confidence: 0.95,
        entities: { location: 'Goa', dates: 'next weekend' },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(refinedGoal) } }],
      });

      const result = await service.refineGoal(currentGoal, 'Book a hotel in Goa');
      expect(result.taskType).toBe('hotel_booking');
      expect(result.ambiguityScore).toBeLessThan(0.5);
    });

    it('should return original goal when LLM refinement fails', async () => {
      const currentGoal = {
        taskType: 'general',
        intent: 'Book something',
        entities: {},
        constraints: [],
        preferredWebsites: [],
        estimatedComplexity: 'moderate' as const,
        requiresPayment: false,
        requiresLogin: false,
        sensitiveData: false,
        ambiguityScore: 0.8,
        clarifyingQuestions: [],
        confidence: 0.4,
      };

      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const result = await service.refineGoal(currentGoal, 'Book a hotel');
      expect(result).toEqual(currentGoal);
    });
  });
});
