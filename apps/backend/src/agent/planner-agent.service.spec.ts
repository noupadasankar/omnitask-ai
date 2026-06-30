import { Test, TestingModule } from '@nestjs/testing';
import { PlannerAgentService } from './planner-agent.service';
import { LlmService } from '../common/llm/llm.service';
import { SkillRegistryService } from './skill-registry.service';
import { UserProfileMemoryService } from './user-profile-memory.service';

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

const mockSkillRegistry = {
  listSkills: jest.fn(),
};

const mockUserProfileMemory = {
  getProfileCard: jest.fn(),
};

describe('PlannerAgentService', () => {
  let service: PlannerAgentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerAgentService,
        { provide: LlmService, useValue: mockLlmService },
        { provide: SkillRegistryService, useValue: mockSkillRegistry },
        { provide: UserProfileMemoryService, useValue: mockUserProfileMemory },
      ],
    }).compile();
    service = module.get<PlannerAgentService>(PlannerAgentService);

    mockSkillRegistry.listSkills.mockReturnValue([]);
    mockUserProfileMemory.getProfileCard.mockResolvedValue({
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      addresses: ['Home'],
      resumes: [],
      paymentPreferences: {},
      favoriteSites: [],
    });
  });

  describe('createPlan', () => {
    it('should create a plan via LLM with steps', async () => {
      const llmResponse = {
        goal: 'Search Google for OpenAI',
        steps: [
          { index: 0, action: 'navigate', target: 'https://google.com', value: null, description: 'Go to Google', riskLevel: 'LOW', requiresApproval: false, skillName: 'NavigationSkill' },
          { index: 1, action: 'type', target: 'input[name="q"]', value: 'OpenAI', description: 'Search for OpenAI', riskLevel: 'LOW', requiresApproval: false, skillName: 'SearchSkill' },
        ],
        estimatedDuration: 30,
        skillsUsed: ['NavigationSkill', 'SearchSkill'],
        riskAssessment: { overallRisk: 'LOW', reasons: ['Basic search'], requiresUserApproval: false },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      });

      const plan = await service.createPlan('Search Google for OpenAI');

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].action).toBe('navigate');
      expect(plan.skillsUsed).toContain('SearchSkill');
      expect(plan.riskAssessment.overallRisk).toBe('LOW');
    });

    it('should use local fallback plan when LLM unavailable', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const plan = await service.createPlan('Do something');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].action).toBe('wait');
      expect(plan.riskAssessment.overallRisk).toBe('MEDIUM');
      expect(plan.riskAssessment.reasons[0]).toContain('Local deterministic plan');
    });

    it('should use local fallback when no API key', async () => {
      // Temporarily make LLM unavailable for this test
      (mockLlmService as any).available = false;
      mockSkillRegistry.listSkills.mockReturnValue([]);
      mockUserProfileMemory.getProfileCard.mockResolvedValue(null);

      const plan = await service.createPlan('Test');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].action).toBe('wait');

      // Restore
      (mockLlmService as any).available = true;
    });

    it('should load user profile when userId provided', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ goal: 'test', steps: [], estimatedDuration: 10, skillsUsed: [], riskAssessment: { overallRisk: 'LOW', reasons: [], requiresUserApproval: false } }) } }],
      });

      await service.createPlan('Test', { userId: 'user-1' });

      expect(mockUserProfileMemory.getProfileCard).toHaveBeenCalledWith('user-1');
    });

    it('should include strategy hints in prompt', async () => {
      const strategyHints = 'Previous successful strategy: use direct URLs';
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ goal: 'test', steps: [], estimatedDuration: 10, skillsUsed: [], riskAssessment: { overallRisk: 'LOW', reasons: [], requiresUserApproval: false } }) } }],
      });

      await service.createPlan('Test', { strategyHints });

      const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const systemMsg = createCall.messages[0].content;
      expect(systemMsg).toContain(strategyHints);
    });

    it('should validate and sanitize step fields', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          goal: 'test',
          steps: [{ action: null, description: null }],
          estimatedDuration: 10,
          skillsUsed: [],
          riskAssessment: { overallRisk: 'LOW', reasons: [], requiresUserApproval: false },
        }) } }],
      });

      const plan = await service.createPlan('Test');
      expect(plan.steps[0].action).toBe('wait');
      expect(plan.steps[0].description).toBe('Step 0');
    });

    it('should handle LLM returning empty response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const plan = await service.createPlan('Test');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].action).toBe('wait');
    });
  });

  describe('replanFromStep', () => {
    it('should generate new steps after failure via LLM', async () => {
      const originalPlan = {
        taskId: '',
        goal: 'Test goal',
        steps: [
          { index: 0, action: 'navigate' as const, target: 'https://example.com', description: 'Go to site', riskLevel: 'LOW' as const, requiresApproval: false },
          { index: 1, action: 'click' as const, target: '#button', description: 'Click button', riskLevel: 'LOW' as const, requiresApproval: false },
        ],
        estimatedDuration: 30,
        riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
      };

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          steps: [
            { action: 'navigate', target: 'https://example.com/alt', description: 'Try alternative page', riskLevel: 'LOW', requiresApproval: false },
          ],
        }) } }],
      });

      const steps = await service.replanFromStep(originalPlan, 1, 'Element not found');
      expect(steps).toHaveLength(1);
      expect(steps[0].action).toBe('navigate');
    });

    it('should return empty array when LLM fails', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

      const steps = await service.replanFromStep(
        { taskId: '', goal: 'test', steps: [], estimatedDuration: 0, riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false } },
        0,
        'Error',
      );
      expect(steps).toEqual([]);
    });

    it('should include screenshot analysis in replan prompt', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ steps: [] }) } }],
      });

      await service.replanFromStep(
        { taskId: '', goal: 'test', steps: [{ index: 0, action: 'click' as const, description: 'Click', riskLevel: 'LOW' as const, requiresApproval: false }], estimatedDuration: 0, riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false } },
        0,
        'Error',
        'Page showing error modal',
      );

      const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userMsg = createCall.messages[1].content;
      expect(userMsg).toContain('Page showing error modal');
    });
  });
});
