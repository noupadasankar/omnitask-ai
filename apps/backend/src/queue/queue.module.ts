// apps/backend/src/queue/queue.module.ts

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './queue.service';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    BullModule.registerQueue(
      { name: 'tasks' },
      { name: 'files' },
      { name: 'failed' },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
