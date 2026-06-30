import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhookListener } from './webhook.listener';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [PrismaModule, EventEmitterModule],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookListener],
  exports: [WebhookService],
})
export class WebhookModule {}
