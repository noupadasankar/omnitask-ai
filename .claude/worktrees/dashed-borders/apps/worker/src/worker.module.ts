import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { WorkerTaskProcessor } from './processors/worker-task.processor';

/**
 * Standalone worker process.
 * Connects to the same Redis as the API.
 *
 * Queues consumed:
 *   - 'tasks' → WorkerTaskProcessor (lightweight background jobs)
 *
 * Live browser execution now runs in the Python Playwright engine
 * (apps/browser-py); the legacy Puppeteer 'browser-tasks' processor was removed.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue({ name: 'tasks' }),
  ],
  providers: [WorkerTaskProcessor],
})
export class WorkerModule {}
