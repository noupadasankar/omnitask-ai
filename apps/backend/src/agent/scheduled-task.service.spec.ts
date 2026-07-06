import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledTaskService } from './scheduled-task.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEngineService } from './execution-engine.service';
import { GoalUnderstandingService } from './goal-understanding.service';

describe('ScheduledTaskService', () => {
  let service: ScheduledTaskService;
  let prisma: any;
  let executionEngine: any;
  let goalService: any;

  beforeEach(async () => {
    prisma = {
      schedule: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      task: { create: jest.fn() },
    };
    executionEngine = { startExecution: jest.fn() };
    goalService = {};
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledTaskService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExecutionEngineService, useValue: executionEngine },
        { provide: GoalUnderstandingService, useValue: goalService },
      ],
    }).compile();
    service = module.get<ScheduledTaskService>(ScheduledTaskService);
  });

  describe('createSchedule', () => {
    it('should create schedule with calculated nextRunAt', async () => {
      prisma.schedule.create.mockResolvedValue({ id: 'sch-1' });

      const result = await service.createSchedule('user-1', 'Daily Task', '0 9 * * *', 'Do something');

      expect(prisma.schedule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          name: 'Daily Task',
          cronExpression: '0 9 * * *',
          enabled: true,
          nextRunAt: expect.any(Date),
        }),
      });
      expect(result).toEqual({ id: 'sch-1' });
    });

    it('should include config in taskTemplate', async () => {
      prisma.schedule.create.mockResolvedValue({ id: 'sch-2' });

      await service.createSchedule('user-1', 'Task', '* * * * *', 'goal', { headless: true });

      const callArg = prisma.schedule.create.mock.calls[0][0];
      expect(callArg.data.taskTemplate).toEqual({ goal: 'goal', config: { headless: true } });
    });
  });

  describe('updateSchedule', () => {
    it('should recalculate nextRunAt when cronExpression changes', async () => {
      prisma.schedule.update.mockResolvedValue({ id: 'sch-1' });

      await service.updateSchedule('sch-1', { cronExpression: '0 12 * * *', enabled: false });

      const callArg = prisma.schedule.update.mock.calls[0][0];
      expect(callArg.data.nextRunAt).toBeInstanceOf(Date);
      expect(callArg.data.enabled).toBe(false);
    });

    it('should not recalculate nextRunAt for other updates', async () => {
      prisma.schedule.update.mockResolvedValue({ id: 'sch-1' });

      await service.updateSchedule('sch-1', { name: 'Renamed' });

      const callArg = prisma.schedule.update.mock.calls[0][0];
      expect(callArg.data.nextRunAt).toBeUndefined();
    });
  });

  describe('deleteSchedule', () => {
    it('should delete schedule by id', async () => {
      prisma.schedule.delete.mockResolvedValue({ id: 'sch-1' });

      await service.deleteSchedule('sch-1');

      expect(prisma.schedule.delete).toHaveBeenCalledWith({ where: { id: 'sch-1' } });
    });
  });

  describe('checkScheduledTasks', () => {
    it('should execute due schedules and update run metrics', async () => {
      const now = new Date();
      prisma.schedule.findMany.mockResolvedValue([
        { id: 'sch-1', userId: 'user-1', name: 'Test', cronExpression: '* * * * *', runCount: 0, failCount: 0, taskTemplate: { goal: 'Test goal' } },
      ]);
      prisma.task.create.mockResolvedValue({ id: 'task-1' });
      executionEngine.startExecution.mockResolvedValue(undefined);
      prisma.schedule.update.mockResolvedValue({});

      await service.checkScheduledTasks();

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', scheduleId: 'sch-1', status: 'QUEUED' }),
      });
      expect(executionEngine.startExecution).toHaveBeenCalledWith('user-1', 'task-1', 'Test goal', { headless: true });
      const updateCall = prisma.schedule.update.mock.calls[0][0];
      expect(updateCall.data.runCount).toEqual({ increment: 1 });
    });

    it('should increment failCount on execution error', async () => {
      prisma.schedule.findMany.mockResolvedValue([
        { id: 'sch-1', userId: 'user-1', name: 'Fail', cronExpression: '* * * * *', runCount: 0, failCount: 0, taskTemplate: { goal: 'Goal' } },
      ]);
      prisma.task.create.mockRejectedValue(new Error('DB error'));
      prisma.schedule.update.mockResolvedValue({});

      await service.checkScheduledTasks();

      const failUpdate = prisma.schedule.update.mock.calls.find(
        (c: any) => c[0].data.failCount,
      );
      expect(failUpdate).toBeDefined();
      expect(failUpdate[0].data.failCount).toEqual({ increment: 1 });
    });

    it('should be no-op when no schedules are due', async () => {
      prisma.schedule.findMany.mockResolvedValue([]);

      await service.checkScheduledTasks();

      expect(prisma.task.create).not.toHaveBeenCalled();
      expect(executionEngine.startExecution).not.toHaveBeenCalled();
    });
  });

  describe('calculateNextRun', () => {
    it('should calculate next run time for valid cron', () => {
      const next = (service as any).calculateNextRun('0 9 * * *');
      expect(next).toBeInstanceOf(Date);
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return fallback for invalid cron expression', () => {
      const next = (service as any).calculateNextRun('not-a-cron');
      expect(next).toBeInstanceOf(Date);
    });
  });
});
