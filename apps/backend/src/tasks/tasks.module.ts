import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksProcessor } from './tasks.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { PlanningModule } from '../planning/planning.module';
import { ExecutionModule } from '../execution/execution.module';
import { AgentModule } from '../agent/agent.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    PlanningModule,
    ExecutionModule,
    AgentModule,
    WebsocketModule,
    BullModule.registerQueue({ name: 'tasks' }),
  ],
  providers: [TasksService, TasksProcessor],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
