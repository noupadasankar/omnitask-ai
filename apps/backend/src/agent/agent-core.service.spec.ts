import { Test, TestingModule } from '@nestjs/testing';
import { AgentCoreService } from './agent-core.service';
import { AgentService } from './agent.service';
import { CriticService } from './critic.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryType } from '@prisma/client';

const mockExecutor = {
  runAgentLoop: jest.fn(),
  getStepResults: jest.fn(),
};

const mockCritic = {
  evaluate: jest.fn(),
};

const mockMemory = {
  store: jest.fn(),
};

describe('AgentCoreService', () => {
  let service: AgentCoreService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentCoreService,
        { provide: AgentService, useValue: mockExecutor },
        { provide: CriticService, useValue: mockCritic },
        { provide: MemoryService, useValue: mockMemory },
      ],
    }).compile();
    service = module.get<AgentCoreService>(AgentCoreService);
  });

  describe('runCycle', () => {
    const executionId = 'exec-1';
    const steps = [{ action: 'navigate', target: 'https://example.com' }];
    const context = { userId: 'user-1', taskId: 'task-1', goal: 'Test goal' };

    it('should store working memory before execution', async () => {
      mockExecutor.runAgentLoop.mockResolvedValue(undefined);
      mockExecutor.getStepResults.mockResolvedValue([]);
      mockCritic.evaluate.mockResolvedValue({ passed: true, score: 95, feedback: 'good', suggestions: [], qualityDimensions: { accuracy: 95, completeness: 95, efficiency: 90, safety: 100 } });

      await service.runCycle(executionId, steps, context);

      expect(mockMemory.store).toHaveBeenCalledWith(
        'user-1',
        'Working: Test goal',
        MemoryType.WORKING,
        { taskId: 'task-1', summary: 'Test goal' },
      );
    });

    it('should run agent loop with steps', async () => {
      mockExecutor.runAgentLoop.mockResolvedValue(undefined);
      mockExecutor.getStepResults.mockResolvedValue([]);
      mockCritic.evaluate.mockResolvedValue({ passed: true, score: 95, feedback: 'good', suggestions: [], qualityDimensions: { accuracy: 95, completeness: 95, efficiency: 90, safety: 100 } });

      await service.runCycle(executionId, steps, context);

      expect(mockExecutor.runAgentLoop).toHaveBeenCalledWith(executionId, steps, 'user-1');
    });

    it('should evaluate results with critic', async () => {
      const results = [{ success: true }];
      mockExecutor.runAgentLoop.mockResolvedValue(undefined);
      mockExecutor.getStepResults.mockResolvedValue(results);
      mockCritic.evaluate.mockResolvedValue({ passed: true, score: 95, feedback: 'good', suggestions: [], qualityDimensions: { accuracy: 95, completeness: 95, efficiency: 90, safety: 100 } });

      await service.runCycle(executionId, steps, context);

      expect(mockCritic.evaluate).toHaveBeenCalledWith(
        { goal: 'Test goal', steps },
        results,
      );
    });

    it('should store episodic and semantic memory when critique passes', async () => {
      mockExecutor.runAgentLoop.mockResolvedValue(undefined);
      mockExecutor.getStepResults.mockResolvedValue([]);
      mockCritic.evaluate.mockResolvedValue({ passed: true, score: 90, feedback: 'Solid execution', suggestions: [], qualityDimensions: { accuracy: 90, completeness: 90, efficiency: 85, safety: 95 } });

      await service.runCycle(executionId, steps, context);

      expect(mockMemory.store).toHaveBeenCalledWith(
        'user-1',
        'Success: Test goal',
        MemoryType.EPISODIC,
        { taskId: 'task-1', summary: 'Solid execution', metadata: { score: 90 } },
      );
      expect(mockMemory.store).toHaveBeenCalledWith(
        'user-1',
        expect.stringContaining('Pattern:'),
        MemoryType.SEMANTIC,
        { taskId: 'task-1', summary: 'Successful plan pattern' },
      );
    });

    it('should not store success memory when critique fails', async () => {
      mockExecutor.runAgentLoop.mockResolvedValue(undefined);
      mockExecutor.getStepResults.mockResolvedValue([]);
      mockCritic.evaluate.mockResolvedValue({ passed: false, score: 40, feedback: 'Bad execution', suggestions: [], qualityDimensions: { accuracy: 30, completeness: 50, efficiency: 40, safety: 60 } });

      await service.runCycle(executionId, steps, context);

      const storeCalls = mockMemory.store.mock.calls.filter(
        (c: any[]) => c[0] === 'user-1' && c[1].startsWith('Success:'),
      );
      expect(storeCalls).toHaveLength(0);
    });

    it('should return plan, results and critique', async () => {
      const results = [{ success: true, output: 'done' }];
      const critiqueResult = { passed: true, score: 95, feedback: 'good', suggestions: [], qualityDimensions: { accuracy: 95, completeness: 95, efficiency: 90, safety: 100 } };
      mockExecutor.runAgentLoop.mockResolvedValue(undefined);
      mockExecutor.getStepResults.mockResolvedValue(results);
      mockCritic.evaluate.mockResolvedValue(critiqueResult);

      const result = await service.runCycle(executionId, steps, context);

      expect(result).toEqual({
        plan: { goal: 'Test goal', steps },
        executionResults: results,
        critique: critiqueResult,
      });
    });

    it('should handle empty steps array', async () => {
      mockExecutor.runAgentLoop.mockResolvedValue(undefined);
      mockExecutor.getStepResults.mockResolvedValue([]);
      mockCritic.evaluate.mockResolvedValue({ passed: true, score: 100, feedback: 'No steps needed', suggestions: [], qualityDimensions: { accuracy: 100, completeness: 100, efficiency: 100, safety: 100 } });

      const result = await service.runCycle(executionId, [], context);
      expect(mockExecutor.runAgentLoop).toHaveBeenCalledWith(executionId, [], 'user-1');
      expect(result.plan.steps).toEqual([]);
    });
  });
});
