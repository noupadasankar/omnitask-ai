import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, JobOptions } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

export type TaskJobName = 'execute-after-plan' | 'process-task' | 'process-step';

const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
};

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('tasks') private readonly tasksQueue: Queue,
    @InjectQueue('files') private readonly filesQueue: Queue,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  async onModuleInit() {
    this.circuitBreakerService.register('bull-tasks', {
      failureThreshold: 5,
      cooldownMs: 30_000,
      timeoutMs: 10_000,
    });
    this.circuitBreakerService.register('bull-files', {
      failureThreshold: 5,
      cooldownMs: 30_000,
      timeoutMs: 10_000,
    });
    this.logger.log('Bull queue circuit breakers registered');
  }

  async addTaskJob(
    jobName: TaskJobName,
    taskId: string,
    data: Record<string, unknown>,
    options?: JobOptions,
  ) {
    if (!this.circuitBreakerService.isAllowed('bull-tasks')) {
      throw new Error('Tasks queue circuit is OPEN');
    }
    try {
      const job = await this.tasksQueue.add(
        jobName,
        { taskId, ...data },
        { ...DEFAULT_JOB_OPTIONS, timeout: 5 * 60 * 1000, ...options },
      );
      this.circuitBreakerService.onSuccess('bull-tasks');
      this.logger.log(`Queue job [${jobName}] id=${job.id} task=${taskId}`);
      return { jobId: job.id, taskId, jobName };
    } catch (err) {
      this.circuitBreakerService.onFailure('bull-tasks');
      throw err;
    }
  }

  async addFileJob(fileId: string, data: Record<string, unknown>) {
    if (!this.circuitBreakerService.isAllowed('bull-files')) {
      throw new Error('Files queue circuit is OPEN');
    }
    try {
      const job = await this.filesQueue.add('process-file', { fileId, ...data }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.circuitBreakerService.onSuccess('bull-files');
      this.logger.log(`File job created: ${job.id}`);
      return { jobId: job.id, fileId };
    } catch (err) {
      this.circuitBreakerService.onFailure('bull-files');
      throw err;
    }
  }

  async getQueueStats() {
    if (!this.circuitBreakerService.isAllowed('bull-tasks')) {
      return { tasks: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }, circuitOpen: true };
    }
    try {
      const tasksCounts = await this.tasksQueue.getJobCounts();
      this.circuitBreakerService.onSuccess('bull-tasks');
      return { tasks: tasksCounts };
    } catch (err) {
      this.circuitBreakerService.onFailure('bull-tasks');
      throw err;
    }
  }
}
