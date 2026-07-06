//tasks.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionService } from '../execution/execution.service';
import { WebsocketService } from '../websocket/websocket.service';
import { TaskStatus } from '@prisma/client';

@Processor('tasks')
export class TasksProcessor {
  private readonly logger = new Logger(TasksProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
    private readonly websocket: WebsocketService,
  ) {}

  @Process('execute-after-plan')
  async handleExecuteAfterPlan(job: Job<{ taskId: string; userId: string }>) {
    const { taskId, userId } = job.data;
    this.logger.log(`Auto-executing planned task ${taskId}`);

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.RUNNING, startedAt: new Date() },
    });

    const executionId = await this.executionService.executeTask(taskId, userId);

    this.websocket.emitToUser(userId, 'task:execution:started', {
      taskId,
      executionId,
    });
  }
}
