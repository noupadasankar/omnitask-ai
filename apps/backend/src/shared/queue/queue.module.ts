import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [BullModule.registerQueue({ name: 'tasks' })],
  exports: [BullModule],
})
export class QueueModule {}