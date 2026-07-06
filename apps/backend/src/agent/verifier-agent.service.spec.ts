import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../common/llm/llm.service';
import { VerifierAgentService, ExecutionSummary, VerificationResult } from './verifier-agent.service';

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

const mockPlan = {
  taskId: 'task-1', goal: 'Find best laptop', estimatedDuration: 60,
  steps: [
    { index: 0, action: 'navigate' as const, value: 'https://amazon.com', description: '[SearchSkill] Go to Amazon', riskLevel: 'LOW' as const, requiresApproval: false },
    { index: 1, action: 'type' as const, value: 'laptop', description: '[SearchSkill] Search laptops', riskLevel: 'LOW' as const, requiresApproval: false },
  ],
  skillsUsed: ['SearchSkill', 'CompareSkill'],
  riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
};

function makeSummary(overrides: Partial<ExecutionSummary> = {}): ExecutionSummary {
  return {
    goal: 'Find best laptop',
    plan: mockPlan,
    stepsCompleted: 6,
    stepsFailed: 0,
    totalSteps: 6,
    durationMs: 45000,
    errorHistory: [],
    ...overrides,
  };
}

describe('VerifierAgentService', () => {
  let service: VerifierAgentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifierAgentService,
        { provide: LlmService, useValue: mockLlmService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test-key') },
        },
      ],
    }).compile();
    service = module.get<VerifierAgentService>(VerifierAgentService);
  });

  describe('verify - LLM-free mode (default)', () => {
    it('should accept when no steps failed', async () => {
      const result = await service.verify(makeSummary());
      expect(result.verified).toBe(true);
      expect(result.nextAction).toBe('accept');
      expect(result.confidence).toBe(0.6);
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it('should reject when steps failed', async () => {
      const result = await service.verify(makeSummary({
        stepsCompleted: 3, stepsFailed: 3, errorHistory: ['Navigation timeout'],
      }));
      expect(result.verified).toBe(false);
      expect(result.nextAction).toBe('replan');
      expect(result.confidence).toBe(0.35);
    });

    it('should classify partial failure as retry', async () => {
      const result = await service.verify(makeSummary({
        stepsCompleted: 4, stepsFailed: 2, totalSteps: 6, errorHistory: ['One error'],
      }));
      expect(result.verified).toBe(false);
      expect(result.score).toBeLessThan(50);
    });
  });

  describe('verify - LLM mode', () => {
    async function createLlmService(): Promise<VerifierAgentService> {
      const configGet = jest.fn();
      configGet.mockImplementation((key: string) => {
        if (key === 'ENABLE_LLM_VERIFIER') return 'true';
        if (key === 'OPENAI_API_KEY') return 'sk-real-key';
        return undefined;
      });
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VerifierAgentService,
          { provide: ConfigService, useValue: { get: configGet } },
        ],
      }).compile();
      return module.get<VerifierAgentService>(VerifierAgentService);
    }

    it('should use LLM verification when enabled', async () => {
      service = await createLlmService();
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              verified: true, confidence: 0.92, score: 88,
              summary: 'Goal achieved', evidence: { sitesTested: ['amazon.com'], actionsCount: { SearchSkill: 2 }, artifactsCreated: [] },
              gaps: [], achievements: ['Found laptops'], nextAction: 'accept', reasoning: 'Looks good',
            }),
          },
        }],
      });

      const result = await service.verify(makeSummary());
      expect(result.verified).toBe(true);
      expect(result.score).toBe(88);
      expect(result.nextAction).toBe('accept');
    });

    it('should clamp score to 0-100 range', async () => {
      service = await createLlmService();
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              verified: true, confidence: 1.5, score: 150,
              summary: 'Overconfident', evidence: { sitesTested: [], actionsCount: {}, artifactsCreated: [] },
              gaps: [], achievements: [], nextAction: 'accept', reasoning: 'Great',
            }),
          },
        }],
      });

      const result = await service.verify(makeSummary());
      expect(result.confidence).toBe(1.0);
      expect(result.score).toBe(100);
    });

    it('should fall back to heuristic on LLM failure', async () => {
      service = await createLlmService();
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('API error'));

      const result = await service.verify(makeSummary());
      expect(result.verified).toBe(true);
      expect(result.nextAction).toBe('accept');
    });

    it('should fall back on empty LLM response', async () => {
      service = await createLlmService();
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
      });

      const result = await service.verify(makeSummary());
      expect(result.verified).toBe(true);
    });
  });

  describe('buildDeterministicEvidence', () => {
    it('should count actions per skill', () => {
      const evidence = service.buildDeterministicEvidence(makeSummary());
      expect(evidence.actionsCount['SearchSkill']).toBe(2);
      expect(evidence.sitesTested).toContain('SearchSkill');
      expect(evidence.sitesTested).toContain('CompareSkill');
    });

    it('should extract skills from description brackets', () => {
      const summary = makeSummary({
        plan: {
          ...mockPlan,
          skillsUsed: [],
          steps: [
            { index: 0, action: 'click', description: '[CustomSkill] Click button', riskLevel: 'LOW', requiresApproval: false },
          ],
        },
      });
      const evidence = service.buildDeterministicEvidence(summary);
      expect(evidence.actionsCount['CustomSkill']).toBe(1);
    });

    it('should use matchedPluginIds when provided', () => {
      const evidence = service.buildDeterministicEvidence(makeSummary({
        matchedPluginIds: ['LinkedInPlugin'],
        plan: { ...mockPlan, skillsUsed: [], steps: [] },
      }));
      expect(evidence.sitesTested).toContain('LinkedInPlugin');
    });
  });

  describe('verifyFromScreenshot', () => {
    it('should return default result when LLM verifier is disabled', async () => {
      const result = await service.verifyFromScreenshot('base64img', 'goal', 'last step');
      expect(result.confidence).toBe(0.5);
      expect(result.shouldContinue).toBe(true);
    });

    it('should return fallback on LLM failure', async () => {
      const configGet = jest.fn();
      configGet.mockImplementation((key: string) => {
        if (key === 'ENABLE_LLM_VERIFIER') return 'true';
        if (key === 'OPENAI_API_KEY') return 'sk-real-key';
        return undefined;
      });
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VerifierAgentService,
          { provide: ConfigService, useValue: { get: configGet } },
        ],
      }).compile();
      const svc = module.get<VerifierAgentService>(VerifierAgentService);

      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('Vision error'));

      const result = await svc.verifyFromScreenshot('img', 'goal', 'step');
      expect(result.confidence).toBe(0.5);
      expect(result.shouldContinue).toBe(true);
    });
  });
});
