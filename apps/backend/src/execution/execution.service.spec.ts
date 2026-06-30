import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionService } from './execution.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { StepStatus } from './enums/execution-status.enum';

const mockPrisma = {
  task: { findUnique: jest.fn(), update: jest.fn() },
  execution: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  executionStep: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
};

const mockQueue = { addTaskJob: jest.fn() };

describe('ExecutionService', () => {
  let service: ExecutionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QueueService, useValue: mockQueue },
      ],
    }).compile();
    service = module.get<ExecutionService>(ExecutionService);
  });

  describe('executeTask', () => {
    it('should throw if task missing plan', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: null });
      await expect(service.executeTask('t1', 'u1')).rejects.toThrow('not found or missing plan');
    });

    it('should create execution with RUNNING status', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: { steps: [] }, naturalLanguage: 'goal' });
      mockPrisma.execution.create.mockResolvedValue({ id: 'e1' });
      mockPrisma.task.update.mockResolvedValue({});
      await service.executeTask('t1', 'u1');
      expect(mockPrisma.execution.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: StepStatus.RUNNING }),
      }));
    });

    it('should queue job with correct payload', async () => {
      const steps = [{ id: 's1', action: 'navigate' }];
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: { steps }, naturalLanguage: 'goal' });
      mockPrisma.execution.create.mockResolvedValue({ id: 'e1' });
      mockPrisma.task.update.mockResolvedValue({});
      await service.executeTask('t1', 'u1');
      expect(mockQueue.addTaskJob).toHaveBeenCalledWith('process-task', 't1', {
        executionId: 'e1', steps, userId: 'u1', goal: 'goal', stepCount: 1,
      });
    });

    it('should update task status to RUNNING', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: { steps: [] }, naturalLanguage: 'g' });
      mockPrisma.execution.create.mockResolvedValue({ id: 'e1' });
      mockPrisma.task.update.mockResolvedValue({});
      await service.executeTask('t1', 'u1');
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: StepStatus.RUNNING }),
      }));
    });

    it('should return execution id', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: { steps: [] }, naturalLanguage: 'g' });
      mockPrisma.execution.create.mockResolvedValue({ id: 'e1' });
      mockPrisma.task.update.mockResolvedValue({});
      const result = await service.executeTask('t1', 'u1');
      expect(result).toBe('e1');
    });

    it('should set attemptNumber to 1', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: { steps: [] }, naturalLanguage: 'g' });
      mockPrisma.execution.create.mockResolvedValue({ id: 'e1' });
      mockPrisma.task.update.mockResolvedValue({});
      await service.executeTask('t1', 'u1');
      expect(mockPrisma.execution.create.mock.calls[0][0].data.attemptNumber).toBe(1);
    });
  });

  describe('enqueueStep', () => {
    it('should queue step with correct parameters', async () => {
      mockQueue.addTaskJob.mockResolvedValue({ id: 'job1' });
      await service.enqueueStep('t1', 'e1', 'u1', 0, { action: 'click' });
      expect(mockQueue.addTaskJob).toHaveBeenCalledWith('process-step', 't1', { executionId: 'e1', userId: 'u1', stepIndex: 0, step: { action: 'click' }, attempt: 1 }, { attempts: 2, priority: 2 });
    });

    it('should pass attempt number', async () => {
      mockQueue.addTaskJob.mockResolvedValue({ id: 'job2' });
      await service.enqueueStep('t1', 'e1', 'u1', 1, {}, 3);
      expect(mockQueue.addTaskJob.mock.calls[0][2].attempt).toBe(3);
    });
  });

  describe('updateStepStatus', () => {
    it('should create step record if not exists', async () => {
      mockPrisma.executionStep.findFirst.mockResolvedValue(null);
      await service.updateStepStatus('e1', 0, StepStatus.COMPLETED, { result: 'ok' }, undefined, { stepType: 'browser', action: 'navigate', input: { url: 'http://x' } });
      expect(mockPrisma.executionStep.create).toHaveBeenCalled();
    });

    it('should update step record if exists', async () => {
      mockPrisma.executionStep.findFirst.mockResolvedValue({ id: 'es1', startedAt: new Date() });
      await service.updateStepStatus('e1', 0, StepStatus.COMPLETED, { result: 'ok' });
      expect(mockPrisma.executionStep.update).toHaveBeenCalled();
    });

    it('should calculate durationMs on completion', async () => {
      mockPrisma.executionStep.findFirst.mockResolvedValue({ id: 'es1', startedAt: new Date(Date.now() - 5000) });
      await service.updateStepStatus('e1', 0, StepStatus.COMPLETED);
      const call = mockPrisma.executionStep.update.mock.calls[0][0];
      expect(call.data.durationMs).toBeGreaterThanOrEqual(4000);
    });

    it('should set errorMessage when provided', async () => {
      mockPrisma.executionStep.findFirst.mockResolvedValue(null);
      await service.updateStepStatus('e1', 0, StepStatus.FAILED, undefined, 'Step crashed');
      const call = mockPrisma.executionStep.create.mock.calls[0][0];
      expect(call.data.errorMessage).toBe('Step crashed');
    });

    it('should not set durationMs for RUNNING status', async () => {
      mockPrisma.executionStep.findFirst.mockResolvedValue({ id: 'es1', startedAt: new Date() });
      await service.updateStepStatus('e1', 0, StepStatus.RUNNING);
      expect(mockPrisma.executionStep.update.mock.calls[0][0].data.durationMs).toBeUndefined();
    });
  });

  describe('completeExecution', () => {
    it('should throw if execution not found', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue(null);
      await expect(service.completeExecution('e1', true)).rejects.toThrow('not found');
    });

    it('should mark execution COMPLETED on success', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', startedAt: new Date(), taskId: 't1' });
      mockPrisma.execution.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});
      await service.completeExecution('e1', true);
      expect(mockPrisma.execution.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: StepStatus.COMPLETED }),
      }));
    });

    it('should mark execution FAILED on failure', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', startedAt: new Date(), taskId: 't1' });
      mockPrisma.execution.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});
      await service.completeExecution('e1', false, 'Something broke');
      expect(mockPrisma.execution.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: StepStatus.FAILED }),
      }));
    });

    it('should set task status to COMPLETED on success', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', startedAt: new Date(), taskId: 't1' });
      mockPrisma.execution.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});
      await service.completeExecution('e1', true);
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: StepStatus.COMPLETED }),
      }));
    });

    it('should set task status to FAILED on failure', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', startedAt: new Date(), taskId: 't1' });
      mockPrisma.execution.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});
      await service.completeExecution('e1', false);
      expect(mockPrisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: StepStatus.FAILED }),
      }));
    });

    it('should calculate overall durationMs', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', startedAt: new Date(Date.now() - 10000), taskId: 't1' });
      mockPrisma.execution.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});
      await service.completeExecution('e1', true);
      const update = mockPrisma.execution.update.mock.calls[0][0];
      expect(update.data.durationMs).toBeGreaterThanOrEqual(9000);
    });

    it('should set task errorMessage on failure', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', startedAt: new Date(), taskId: 't1' });
      mockPrisma.execution.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});
      await service.completeExecution('e1', false, 'Timeout');
      expect(mockPrisma.task.update.mock.calls[0][0].data.errorMessage).toBe('Timeout');
    });

    it('should clear errorMessage on success', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', startedAt: new Date(), taskId: 't1' });
      mockPrisma.execution.update.mockResolvedValue({});
      mockPrisma.task.update.mockResolvedValue({});
      await service.completeExecution('e1', true);
      expect(mockPrisma.task.update.mock.calls[0][0].data.errorMessage).toBeNull();
    });
  });

  describe('getExecution', () => {
    it('should return execution with ordered steps', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue({ id: 'e1', steps: [] });
      const result = await service.getExecution('e1');
      expect(result).toEqual({ id: 'e1', steps: [] });
    });

    it('should return null for missing execution', async () => {
      mockPrisma.execution.findUnique.mockResolvedValue(null);
      const result = await service.getExecution('e1');
      expect(result).toBeNull();
    });
  });

  describe('getExecutionSteps', () => {
    it('should return ordered step list', async () => {
      mockPrisma.executionStep.findMany.mockResolvedValue([{ stepIndex: 0 }, { stepIndex: 1 }]);
      const result = await service.getExecutionSteps('e1');
      expect(result).toHaveLength(2);
    });

    it('should return empty array if no steps', async () => {
      mockPrisma.executionStep.findMany.mockResolvedValue([]);
      const result = await service.getExecutionSteps('e1');
      expect(result).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty step array', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: { steps: [] }, naturalLanguage: 'g' });
      mockPrisma.execution.create.mockResolvedValue({ id: 'e1' });
      mockPrisma.task.update.mockResolvedValue({});
      await service.executeTask('t1', 'u1');
      expect(mockQueue.addTaskJob).toHaveBeenCalledWith('process-task', 't1', expect.objectContaining({ stepCount: 0 }));
    });

    it('should handle many steps (50+)', async () => {
      const steps = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, action: 'navigate' }));
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', plan: { steps }, naturalLanguage: 'g' });
      mockPrisma.execution.create.mockResolvedValue({ id: 'e1' });
      mockPrisma.task.update.mockResolvedValue({});
      await service.executeTask('t1', 'u1');
      expect(mockQueue.addTaskJob.mock.calls[0][2].stepCount).toBe(50);
    });

    it('should default stepMeta for create', async () => {
      mockPrisma.executionStep.findFirst.mockResolvedValue(null);
      await service.updateStepStatus('e1', 0, StepStatus.COMPLETED);
      const created = mockPrisma.executionStep.create.mock.calls[0][0].data;
      expect(created.stepType).toBe('UNKNOWN');
      expect(created.action).toBe('execute');
    });
  });
});
