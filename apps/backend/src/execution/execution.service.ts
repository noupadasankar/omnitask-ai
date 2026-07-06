import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { ExecutionStatus, StepStatus } from './enums/execution-status.enum';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async executeTask(taskId: string, userId: string): Promise<string> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { plan: true },
    });

    if (!task?.plan) {
      throw new Error(`Task ${taskId} not found or missing plan`);
    }

    const execution = await this.prisma.execution.create({
      data: {
        taskId,
        status: ExecutionStatus.RUNNING,
        attemptNumber: 1,
        startedAt: new Date(),
      },
    });

    const steps = (task.plan.steps as unknown[]) || [];

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.RUNNING, startedAt: new Date() },
    });

    await this.queueService.addTaskJob('process-task', taskId, {
      executionId: execution.id,
      steps,
      userId,
      goal: task.naturalLanguage,
      stepCount: steps.length,
    });

    this.logger.log(`Execution ${execution.id} queued (${steps.length} steps)`);
    return execution.id;
  }

  async enqueueStep(
    taskId: string,
    executionId: string,
    userId: string,
    stepIndex: number,
    step: unknown,
    attempt = 1,
  ) {
    return this.queueService.addTaskJob(
      'process-step',
      taskId,
      { executionId, userId, stepIndex, step, attempt },
      { attempts: 2, priority: 2 },
    );
  }

  async updateStepStatus(
    executionId: string,
    stepIndex: number,
    status: StepStatus,
    output?: unknown,
    error?: string,
    stepMeta?: { stepType?: string; action?: string; input?: unknown },
  ): Promise<void> {
    const existing = await this.prisma.executionStep.findFirst({
      where: { executionId, stepIndex },
    });

    const startedAt = existing?.startedAt ?? new Date();
    const completedAt = status !== StepStatus.RUNNING ? new Date() : undefined;
    const durationMs =
      completedAt && startedAt ? completedAt.getTime() - startedAt.getTime() : undefined;

    const payload = {
      status,
      output: output as object | undefined,
      errorMessage: error,
      completedAt,
      durationMs,
    };

    if (existing) {
      await this.prisma.executionStep.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.executionStep.create({
        data: {
          executionId,
          stepIndex,
          stepType: stepMeta?.stepType ?? 'UNKNOWN',
          action: stepMeta?.action ?? 'execute',
          input: (stepMeta?.input ?? {}) as object,
          startedAt,
          ...payload,
        },
      });
    }
  }

  async completeExecution(executionId: string, success: boolean, errorMessage?: string) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - execution.startedAt.getTime();

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status: success ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED,
        completedAt,
        durationMs,
      },
    });

    await this.prisma.task.update({
      where: { id: execution.taskId },
      data: {
        status: success ? TaskStatus.COMPLETED : TaskStatus.FAILED,
        completedAt,
        errorMessage: success ? null : errorMessage ?? 'Execution failed',
      },
    });
  }

  async getExecution(executionId: string) {
    return this.prisma.execution.findUnique({
      where: { id: executionId },
      include: { steps: { orderBy: { stepIndex: 'asc' } } },
    });
  }

  async getExecutionSteps(executionId: string) {
    return this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { stepIndex: 'asc' },
    });
  }
}
