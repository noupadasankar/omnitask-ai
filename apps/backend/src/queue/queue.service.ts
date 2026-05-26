import { Injectable, Logger } from '@nestjs/common';
import { Queue, JobOptions } from 'bull';
import { InjectQueue } from '@nestjs/bull';

export type TaskJobName = 'execute-after-plan' | 'process-task' | 'process-step';

const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
};

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('tasks') private readonly tasksQueue: Queue,
    @InjectQueue('files') private readonly filesQueue: Queue,
  ) {}

  async addTaskJob(
    jobName: TaskJobName,
    taskId: string,
    data: Record<string, unknown>,
    options?: JobOptions,
  ) {
    const job = await this.tasksQueue.add(
      jobName,
      { taskId, ...data },
      { ...DEFAULT_JOB_OPTIONS, timeout: 5 * 60 * 1000, ...options },
    );

    this.logger.log(`Queue job [${jobName}] id=${job.id} task=${taskId}`);
    return { jobId: job.id, taskId, jobName };
  }

  async addFileJob(fileId: string, data: Record<string, unknown>) {
    const job = await this.filesQueue.add('process-file', { fileId, ...data }, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 2000 },
      removeOnComplete: true,
    });
    this.logger.log(`File job created: ${job.id}`);
    return { jobId: job.id, fileId };
  }
}
