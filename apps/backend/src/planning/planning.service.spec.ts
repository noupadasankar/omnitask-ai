import { Test, TestingModule } from '@nestjs/testing';
import { PlanningService } from './planning.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiPlannerService } from './ai-planner.service';
import { TaskStatus } from '@prisma/client';

const mockPrisma = {
  task: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  plan: {
    create: jest.fn(),
  },
};

const mockAiPlanner = { createPlan: jest.fn() };

describe('PlanningService', () => {
  let service: PlanningService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiPlannerService, useValue: mockAiPlanner },
      ],
    }).compile();
    service = module.get<PlanningService>(PlanningService);
  });

  describe('generatePlan', () => {
    it('should create task with PLANNING status', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't1', title: 'test', status: TaskStatus.PLANNING, planHash: 'hash' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'test', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't1', plan: {} });
      await service.generatePlan('test goal', 'u1');
      expect(mockPrisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: TaskStatus.PLANNING }),
      }));
    });

    it('should return cached plan for identical input', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', plan: { steps: [] } });
      const result = await service.generatePlan('repeat goal', 'u1');
      expect(result).toEqual({ id: 't1', plan: { steps: [] } });
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });

    it('should call aiPlanner.createPlan with natural language', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't2', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'test', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't2', plan: {} });
      await service.generatePlan('order pizza', 'u1');
      expect(mockAiPlanner.createPlan).toHaveBeenCalledWith('order pizza');
    });

    it('should store validated plan in DB', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't3', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'buy milk', steps: [{ id: '1', type: 'browser', action: 'navigate', description: 'Go to store', input: {} }] });
      mockPrisma.task.update.mockResolvedValue({ id: 't3', plan: {} });
      await service.generatePlan('buy milk', 'u1');
      expect(mockPrisma.plan.create).toHaveBeenCalled();
    });

    it('should transition task to PLANNED on success', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't4', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'go', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't4', plan: {} });
      await service.generatePlan('go', 'u1');
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: TaskStatus.PLANNED }),
      }));
    });

    it('should transition task to FAILED on AI error', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't5', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockRejectedValue(new Error('AI unavailable'));
      await expect(service.generatePlan('fail', 'u1')).rejects.toThrow();
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: TaskStatus.FAILED }),
      }));
    });

    it('should store error message on failure', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't6', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockRejectedValue(new Error('timeout'));
      await expect(service.generatePlan('x', 'u1')).rejects.toThrow();
      const updateCall = mockPrisma.task.update.mock.calls[0][0];
      expect(updateCall.data.errorMessage).toBe('timeout');
    });

    it('should handle plan with multiple steps', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't7', status: TaskStatus.PLANNING, planHash: 'h' });
      const steps = [
        { id: '1', type: 'browser', action: 'navigate', description: 'Open site', input: {} },
        { id: '2', type: 'browser', action: 'click', description: 'Click button', input: {} },
        { id: '3', type: 'browser', action: 'submit', description: 'Submit form', input: {} },
      ];
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'complex', steps });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't7', plan: {} });
      const result = await service.generatePlan('complex task', 'u1');
      expect(result).toBeDefined();
      expect(mockPrisma.plan.create.mock.calls[0][0].data.steps).toHaveLength(3);
    });

    it('should use plan hash for deduplication', async () => {
      mockPrisma.task.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockPrisma.task.create.mockResolvedValueOnce({ id: 't8', status: TaskStatus.PLANNING, planHash: 'h' });
      mockPrisma.task.create.mockResolvedValueOnce({ id: 't9', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'test', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't8', plan: {} });
      await service.generatePlan('  duplicate goal  ', 'u1');
      mockPrisma.task.update.mockResolvedValue({ id: 't9', plan: {} });
      await service.generatePlan('duplicate goal', 'u2');
      const firstHash = mockPrisma.task.create.mock.calls[0][0].data.planHash;
      const secondHash = mockPrisma.task.create.mock.calls[1][0].data.planHash;
      expect(firstHash).toBe(secondHash);
    });

    it('should validate plan structure with Zod', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't9', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'test', steps: [{ id: '1', type: 'browser', action: 'navigate', description: 'Do', input: {} }] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't9', plan: {} });
      await service.generatePlan('test', 'u1');
      expect(mockPrisma.plan.create).toHaveBeenCalled();
    });

    it('should reject invalid plan structure', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't10', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'test' }); // missing steps
      await expect(service.generatePlan('test', 'u1')).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty natural language', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't11', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: '', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't11', plan: {} });
      const result = await service.generatePlan('', 'u1');
      expect(result).toBeDefined();
    });

    it('should handle very long input (1000+ chars)', async () => {
      const long = 'x'.repeat(2000);
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't12', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: long.substring(0, 100), steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't12', plan: {} });
      await service.generatePlan(long, 'u1');
      expect(mockPrisma.task.create.mock.calls[0][0].data.title.length).toBeLessThanOrEqual(100);
    });

    it('should handle AI returning null', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't13', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue(null);
      await expect(service.generatePlan('test', 'u1')).rejects.toThrow();
    });

    it('should not reuse plan with different status', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null); // no cached
      mockPrisma.task.create.mockResolvedValue({ id: 't14', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't14', plan: {} });
      await service.generatePlan('goal', 'u1');
      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: TaskStatus.PLANNED }),
      }));
    });

    it('should set priority to MEDIUM by default', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't15', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't15', plan: {} });
      await service.generatePlan('g', 'u1');
      expect(mockPrisma.task.create.mock.calls[0][0].data.priority).toBe('MEDIUM');
    });

    it('should trim input for hash generation', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't16', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't16', plan: {} });
      await service.generatePlan('  spaced  ', 'u1');
      const hashA = mockPrisma.task.create.mock.calls[0][0].data.planHash;
      mockPrisma.task.create.mockResolvedValue({ id: 't17', status: TaskStatus.PLANNING, planHash: 'h' });
      await service.generatePlan('spaced', 'u1');
      const hashB = mockPrisma.task.create.mock.calls[1][0].data.planHash;
      expect(hashA).toBe(hashB);
    });

    it('should include userId when checking for cached plan', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't18', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't18', plan: {} });
      await service.generatePlan('goal', 'u1');
      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1' }),
      }));
    });

    it('should not reuse cached plan from different userId', async () => {
      mockPrisma.task.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockPrisma.task.create.mockResolvedValueOnce({ id: 't19', status: TaskStatus.PLANNING, planHash: 'h' });
      mockPrisma.task.create.mockResolvedValueOnce({ id: 't20', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'same', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't19', plan: {} });
      await service.generatePlan('same', 'u1');
      mockPrisma.task.update.mockResolvedValue({ id: 't20', plan: {} });
      await service.generatePlan('same', 'u2');
      expect(mockPrisma.task.create).toHaveBeenCalledTimes(2);
    });

    it('should store plan hash for deduplication', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't21', status: TaskStatus.PLANNING, planHash: 'abc123' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'test', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't21', plan: {} });
      await service.generatePlan('test goal', 'u1');
      expect(mockPrisma.task.create.mock.calls[0][0].data.planHash).toBeDefined();
      expect(mockPrisma.task.create.mock.calls[0][0].data.planHash.length).toBe(64);
    });

    it('should handle AI returning non-Error throw', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't22', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockRejectedValue('string error');
      await expect(service.generatePlan('test', 'u1')).rejects.toBe('string error');
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: TaskStatus.FAILED }),
      }));
    });

    it('should include naturalLanguage in created task', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't23', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'buy groceries', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't23', plan: {} });
      await service.generatePlan('buy groceries', 'u1');
      expect(mockPrisma.task.create.mock.calls[0][0].data.naturalLanguage).toBe('buy groceries');
    });

    it('should store validated plan with correct hash', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't24', status: TaskStatus.PLANNING, planHash: 'hash123' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [{ id: '1', type: 'browser', action: 'click', description: 'do', input: {} }] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't24', plan: {} });
      await service.generatePlan('g', 'u1');
      expect(mockPrisma.plan.create.mock.calls[0][0].data.hash).toBeDefined();
    });

    it('should handle AI returning steps missing id field', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't25', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'test', steps: [{ type: 'browser', action: 'navigate', description: 'go', input: {} }] });
      await expect(service.generatePlan('test', 'u1')).rejects.toThrow();
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: TaskStatus.FAILED }),
      }));
    });

    it('should return updated task on successful generation', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't26', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      const updatedTask = { id: 't26', status: TaskStatus.PLANNED, plan: { steps: [] } };
      mockPrisma.task.update.mockResolvedValue(updatedTask);
      const result = await service.generatePlan('g', 'u1');
      expect(result).toEqual(updatedTask);
    });

    it('should store model and tokens in plan', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't27', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [{ id: '1', type: 'browser', action: 'click', description: 'do', input: {} }] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't27', plan: {} });
      await service.generatePlan('g', 'u1');
      expect(mockPrisma.plan.create.mock.calls[0][0].data.model).toBe('ai-planner-v1');
      expect(mockPrisma.plan.create.mock.calls[0][0].data.tokensUsed).toBe(0);
    });

    it('should store validated flag as true in plan', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't28', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'g', steps: [{ id: '1', type: 'browser', action: 'click', description: 'do', input: {} }] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't28', plan: {} });
      await service.generatePlan('g', 'u1');
      expect(mockPrisma.plan.create.mock.calls[0][0].data.validated).toBe(true);
    });

    it('should store goal from AI response in context', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't29', status: TaskStatus.PLANNING, planHash: 'h' });
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'user wants pizza delivery', steps: [] });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't29', plan: {} });
      await service.generatePlan('order pizza', 'u1');
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ context: expect.objectContaining({ goal: 'user wants pizza delivery' }) }),
      }));
    });

    it('should handle steps with various browser action types', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      mockPrisma.task.create.mockResolvedValue({ id: 't30', status: TaskStatus.PLANNING, planHash: 'h' });
      const steps = [
        { id: '1', type: 'browser', action: 'navigate', description: 'Go', input: {} },
        { id: '2', type: 'browser', action: 'type', description: 'Type', input: {} },
        { id: '3', type: 'browser', action: 'submit', description: 'Submit', input: {} },
      ];
      mockAiPlanner.createPlan.mockResolvedValue({ goal: 'multi', steps });
      mockPrisma.plan.create.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({ id: 't30', plan: {} });
      await service.generatePlan('multi action', 'u1');
      expect(mockPrisma.plan.create.mock.calls[0][0].data.steps).toEqual(steps);
    });
  });
});
