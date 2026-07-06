import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEngineService } from './execution-engine.service';
import { GoalUnderstandingService } from './goal-understanding.service';

@Injectable()
export class ScheduledTaskService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTaskService.name);

  constructor(
    private prisma: PrismaService,
    private executionEngine: ExecutionEngineService,
    private goalService: GoalUnderstandingService,
  ) {}

  onModuleInit() {
    this.logger.log('ScheduledTaskService initialized and cron monitor registered.');
  }

  // Runs every minute to find and execute enabled schedules that are due
  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledTasks(): Promise<void> {
    const now = new Date();
    this.logger.debug('Polling database scheduled triggers...');

    const schedules = await this.prisma.schedule.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: now },
      },
    });

    if (schedules.length === 0) return;

    this.logger.log(`Found ${schedules.length} due cron schedules for execution.`);

    for (const schedule of schedules) {
      try {
        const userId = schedule.userId;
        const taskTemplate = schedule.taskTemplate as any;
        const goal = taskTemplate?.goal || 'Scheduled autonomous execution';

        this.logger.log(`Executing scheduled workflow [${schedule.name}] for user ${userId}`);

        // 1. Create a task entry
        const task = await this.prisma.task.create({
          data: {
            userId,
            title: schedule.name,
            naturalLanguage: goal,
            status: 'QUEUED',
            priority: 'MEDIUM',
            scheduleId: schedule.id,
          },
        });

        // 2. Trigger execution engine start
        await this.executionEngine.startExecution(userId, task.id, goal, {
          headless: true,
          ...taskTemplate?.config,
        });

        // 3. Update next run and run metrics
        const nextRunAt = this.calculateNextRun(schedule.cronExpression);
        await this.prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt,
            runCount: { increment: 1 },
          },
        });

      } catch (error: any) {
        this.logger.error(`Failed to trigger schedule ${schedule.id} (${schedule.name}): ${error.message}`);
        await this.prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            failCount: { increment: 1 },
          },
        });
      }
    }
  }

  async createSchedule(
    userId: string,
    name: string,
    cronExpression: string,
    goal: string,
    config: Record<string, any> = {},
  ): Promise<any> {
    this.logger.log(`Creating new schedule [${name}] with cron: "${cronExpression}"`);

    const nextRunAt = this.calculateNextRun(cronExpression);

    return this.prisma.schedule.create({
      data: {
        userId,
        name,
        cronExpression,
        taskTemplate: { goal, config },
        enabled: true,
        nextRunAt,
      },
    });
  }

  async updateSchedule(scheduleId: string, updates: any): Promise<any> {
    this.logger.log(`Updating cron schedule config: ${scheduleId}`);

    if (updates.cronExpression) {
      updates.nextRunAt = this.calculateNextRun(updates.cronExpression);
    }

    return this.prisma.schedule.update({
      where: { id: scheduleId },
      data: updates,
    });
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    this.logger.log(`Deleting schedule: ${scheduleId}`);
    await this.prisma.schedule.delete({
      where: { id: scheduleId },
    });
  }

  // Simple next cron time calculator mock
  private calculateNextRun(cronExpression: string): Date {
    // Standard cron scheduler helper (falls back to current time + 1 hour if parse issues)
    const offset = 60 * 60 * 1000;
    return new Date(Date.now() + offset);
  }
}
