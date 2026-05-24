import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../prisma.service';
import { WsModule } from '../../shared/websocket/ws.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'tasks' }), WsModule],
  controllers: [TasksController],
  providers: [TasksService, PrismaService],
  exports: [TasksService],
})
export class TasksModule {}