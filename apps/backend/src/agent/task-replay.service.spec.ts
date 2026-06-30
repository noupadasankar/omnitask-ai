import { Test, TestingModule } from '@nestjs/testing';
import { TaskReplayService } from './task-replay.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TaskReplayService', () => {
  let service: TaskReplayService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      agentExecutionStep: { findMany: jest.fn() },
      screenshot: { findMany: jest.fn() },
      trajectoryStep: { findMany: jest.fn() },
      executionSession: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskReplayService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<TaskReplayService>(TaskReplayService);
  });

  describe('getReplayData', () => {
    it('should return replay frames from steps and screenshots', async () => {
      prisma.agentExecutionStep.findMany.mockResolvedValue([
        { stepIndex: 0, action: 'navigate', description: 'Go to site', createdAt: new Date('2026-01-01'), target: 'https://x.com', value: null, durationMs: 1000, status: 'completed', screenshotUrl: null },
        { stepIndex: 1, action: 'click', description: 'Click button', createdAt: new Date('2026-01-02'), target: '#btn', value: null, durationMs: 500, status: 'completed', screenshotUrl: null },
      ]);
      prisma.screenshot.findMany.mockResolvedValue([
        { stepIndex: 0, imageUrl: 'https://img.com/1', base64Thumbnail: null },
      ]);

      const frames = await service.getReplayData('session-1');

      expect(frames).toHaveLength(2);
      expect(frames[0].action).toBe('navigate');
      expect(frames[0].screenshotUrl).toBe('https://img.com/1');
      expect(frames[0].durationMs).toBe(1000);
      expect(frames[1].action).toBe('click');
      expect(frames[1].durationMs).toBe(500);
    });

    it('should map screenshots by stepIndex', async () => {
      prisma.agentExecutionStep.findMany.mockResolvedValue([
        { stepIndex: 0, action: 'navigate', description: 'Go', createdAt: new Date(), target: null, value: null, durationMs: 0, status: 'completed', screenshotUrl: null },
      ]);
      prisma.screenshot.findMany.mockResolvedValue([
        { stepIndex: 0, imageUrl: null, base64Thumbnail: 'thumb_base64' },
      ]);

      const frames = await service.getReplayData('session-1');
      expect(frames[0].screenshotUrl).toBe('thumb_base64');
    });

    it('should handle empty results', async () => {
      prisma.agentExecutionStep.findMany.mockResolvedValue([]);
      prisma.screenshot.findMany.mockResolvedValue([]);

      const frames = await service.getReplayData('session-1');
      expect(frames).toEqual([]);
    });
  });

  describe('getReplayThoughts', () => {
    it('should return formatted trajectory thoughts', async () => {
      prisma.trajectoryStep.findMany.mockResolvedValue([
        {
          stepIndex: 0, createdAt: new Date('2026-01-01'), tool: 'search',
          decision: { thought: 'Need to search', assessment: 'clear' },
          confidence: 0.9, risk: 0.1, url: 'https://x.com', observation: 'Page loaded',
        },
      ]);

      const thoughts = await service.getReplayThoughts('session-1');
      expect(thoughts).toHaveLength(1);
      expect(thoughts[0].tool).toBe('search');
      expect(thoughts[0].thought).toBe('Need to search');
      expect(thoughts[0].confidence).toBe(0.9);
      expect(thoughts[0].risk).toBe(0.1);
      expect(thoughts[0].observation).toBe('Page loaded');
    });

    it('should return empty array for no trajectory steps', async () => {
      prisma.trajectoryStep.findMany.mockResolvedValue([]);

      const thoughts = await service.getReplayThoughts('session-1');
      expect(thoughts).toEqual([]);
    });

    it('should handle null decision gracefully', async () => {
      prisma.trajectoryStep.findMany.mockResolvedValue([
        { stepIndex: 0, createdAt: new Date(), tool: null, decision: null, confidence: null, risk: null, url: null, observation: null },
      ]);

      const thoughts = await service.getReplayThoughts('session-1');
      expect(thoughts[0].thought).toBeUndefined();
      expect(thoughts[0].tool).toBeUndefined();
    });
  });

  describe('getSessionTimeline', () => {
    it('should return compiled timeline with steps, approvals, screenshots', async () => {
      prisma.executionSession.findUnique.mockResolvedValue({
        id: 'session-1', metadata: { goal: 'Test goal' }, status: 'completed',
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
        totalSteps: 2, currentStepIndex: 2,
        approvalRequests: [
          { id: 'app-1', createdAt: new Date('2026-01-01T01:00:00Z'), description: 'Approve payment', status: 'APPROVED', riskLevel: 'HIGH', respondedAt: new Date('2026-01-01T01:05:00Z'), actionDetails: 'Pay $100' },
        ],
        screenshots: [
          { id: 'shot-1', timestamp: new Date('2026-01-01T00:30:00Z'), stepIndex: 0, imageUrl: 'https://img.com', base64Thumbnail: null, width: 1920, height: 1080 },
        ],
      });
      prisma.agentExecutionStep.findMany.mockResolvedValue([
        { stepIndex: 0, action: 'navigate', description: 'Go', createdAt: new Date('2026-01-01T00:00:00Z'), status: 'completed', durationMs: 1000, target: null, value: null, errorMessage: null },
      ]);

      const timeline = await service.getSessionTimeline('session-1');
      expect(timeline).not.toBeNull();
      expect(timeline.goal).toBe('Test goal');
      expect(timeline.timeline.length).toBe(3); // step + approval + screenshot
      expect(timeline.timeline[0].type).toBe('step');
      expect(timeline.timeline[1].type).toBe('screenshot'); // sorted by timestamp
      expect(timeline.timeline[2].type).toBe('approval');
    });

    it('should return null for non-existent session', async () => {
      prisma.executionSession.findUnique.mockResolvedValue(null);

      const result = await service.getSessionTimeline('ghost');
      expect(result).toBeNull();
    });
  });
});
