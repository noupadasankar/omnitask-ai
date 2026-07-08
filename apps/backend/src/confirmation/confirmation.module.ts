import { Module } from '@nestjs/common';
import { ConfirmationService } from './confirmation.service';
import { ConfirmationController } from './confirmation.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  providers: [ConfirmationService],
  controllers: [ConfirmationController],
  exports: [ConfirmationService],
})
export class ConfirmationModule {}
