import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [PrismaModule, WebsocketModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
