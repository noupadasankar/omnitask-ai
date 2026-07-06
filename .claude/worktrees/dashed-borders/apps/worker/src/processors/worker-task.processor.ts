import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * Standalone worker placeholder — delegates heavy browser work.
 * Full agent loop runs in the API process via ExecutionTaskWorker.
 * Extend this processor for Playwright-isolated jobs when scaling workers.
 */
@Processor('tasks')
export class WorkerTaskProcessor {
  private readonly logger = new Logger(WorkerTaskProcessor.name);

  @Process('browser-heavy')
  async handleBrowserJob(job: Job) {
    this.logger.log(`Browser job ${job.id} received (extend for Playwright isolation)`);
    return { ok: true };
  }
}
