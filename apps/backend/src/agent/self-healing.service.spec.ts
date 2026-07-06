import { Test, TestingModule } from '@nestjs/testing';
import { SelfHealingService } from './self-healing.service';
import { RecoveryEngineService } from './runtime/self-healing/recovery-engine.service';
import { PrismaService } from '../prisma/prisma.service';

const mockRecoveryEngine = {
  recover: jest.fn(),
};

const mockPrisma = {
  agentExecutionStep: {
    update: jest.fn(),
  },
};

describe('SelfHealingService', () => {
  let service: SelfHealingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelfHealingService,
        { provide: RecoveryEngineService, useValue: mockRecoveryEngine },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<SelfHealingService>(SelfHealingService);
  });

  describe('attemptHealing', () => {
    const healingRequest = {
      sessionId: 'session-1',
      stepIndex: 2,
      action: 'click',
      target: '#submit-btn',
      value: undefined,
      description: 'Click submit button',
      error: 'Element not found: #submit-btn',
      screenshot: 'base64img',
      url: 'https://example.com/form',
      title: 'Form Page',
      viewport: { width: 1920, height: 1080 },
    };

    it('should return healing response when recovery succeeds', async () => {
      mockRecoveryEngine.recover.mockResolvedValue({
        healed: true,
        plan: {
          type: 'selector',
          healed: true,
          alternativeSelector: '#submit-button',
          recoverySteps: [{ action: 'click', target: '#submit-button', description: 'Click alternative button' }],
          explanation: 'Found alternative selector',
          confidence: 0.85,
          resumeAfterRecovery: true,
        },
        analysis: {
          layout: { pageState: 'normal' },
          pageModel: { buttons: [{ text: 'Submit' }], url: 'https://example.com/form' },
        },
        attemptNumber: 1,
      });

      mockPrisma.agentExecutionStep.update.mockResolvedValue({});
      mockRecoveryEngine.recover.mockResolvedValue({
        healed: true,
        plan: {
          type: 'selector',
          healed: true,
          alternativeSelector: '#submit-button',
          recoverySteps: [{ action: 'click', target: '#submit-button', description: 'Click alternative button' }],
          insertSteps: [],
          explanation: 'Found alternative selector',
          confidence: 0.85,
          resumeAfterRecovery: true,
        },
        analysis: {
          layout: { pageState: 'normal' },
          pageModel: { buttons: [ { text: 'Submit' } ], url: 'https://example.com/form' },
        },
        attemptNumber: 1,
      });

      const result = await service.attemptHealing(healingRequest);

      expect(result.healed).toBe(true);
      expect(result.alternativeSelector).toBe('#submit-button');
      expect(result.recoveryType).toBe('selector');
      expect(result.confidence).toBe(0.85);
      expect(result.attemptNumber).toBe(1);
    });

    it('should return healing response when recovery fails', async () => {
      mockRecoveryEngine.recover.mockResolvedValue({
        healed: false,
        plan: {
          type: 'selector',
          healed: false,
          alternativeSelector: undefined,
          recoverySteps: [],
          explanation: 'No alternative found',
          confidence: 0,
          resumeAfterRecovery: false,
        },
        analysis: {
          layout: { pageState: 'error' },
          pageModel: { buttons: [], url: 'https://example.com/form' },
        },
        attemptNumber: 2,
      });

      const result = await service.attemptHealing(healingRequest);

      expect(result.healed).toBe(false);
      expect(result.alternativeSelector).toBeUndefined();
      expect(result.explanation).toBe('No alternative found');
    });

    it('should map vision analysis into response when analysis present', async () => {
      mockRecoveryEngine.recover.mockResolvedValue({
        healed: true,
        plan: {
          type: 'navigation',
          healed: true,
          recoverySteps: [],
          explanation: 'Navigated to correct page',
          confidence: 0.95,
          resumeAfterRecovery: true,
        },
        analysis: {
          layout: { pageState: 'blocked_by_popup' },
          pageModel: { buttons: [{ text: 'Close' }], url: 'https://example.com' },
        },
        attemptNumber: 1,
      });

      const result = await service.attemptHealing(healingRequest);

      expect(result.visionAnalysis).toBeDefined();
      expect(result.visionAnalysis!.pageState).toBe('blocked_by_popup');
      expect(result.visionAnalysis!.buttonCount).toBe(1);
      expect(result.visionAnalysis!.siteKey).toBe('https://example.com');
    });

    it('should update DB step record when healing succeeds', async () => {
      mockRecoveryEngine.recover.mockResolvedValue({
        healed: true,
        plan: {
          type: 'selector',
          healed: true,
          alternativeSelector: '#new-btn',
          recoverySteps: [],
          explanation: 'Found new button',
          confidence: 0.9,
          resumeAfterRecovery: true,
        },
        analysis: {
          layout: { pageState: 'normal' },
          pageModel: { buttons: [], url: 'https://example.com' },
        },
        attemptNumber: 1,
      });

      await service.attemptHealing(healingRequest);

      expect(mockPrisma.agentExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId_stepIndex: {
              sessionId: 'session-1',
              stepIndex: 2,
            },
          },
          data: expect.objectContaining({
            visionAnalysis: expect.objectContaining({
              healed: true,
              recoveryType: 'selector',
              originalSelector: '#submit-btn',
              newSelector: '#new-btn',
            }),
          }),
        }),
      );
    });

    it('should not throw when DB update fails', async () => {
      mockRecoveryEngine.recover.mockResolvedValue({
        healed: true,
        plan: {
          type: 'selector',
          healed: true,
          alternativeSelector: '#new-btn',
          recoverySteps: [],
          explanation: 'Found new button',
          confidence: 0.9,
          resumeAfterRecovery: true,
        },
        analysis: {
          layout: { pageState: 'normal' },
          pageModel: { buttons: [], url: 'https://example.com' },
        },
        attemptNumber: 1,
      });

      mockPrisma.agentExecutionStep.update.mockRejectedValue(new Error('DB error'));

      await expect(service.attemptHealing(healingRequest)).resolves.toBeDefined();
    });
  });
});
