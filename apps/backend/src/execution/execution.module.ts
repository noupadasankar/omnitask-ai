import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ExecutionService } from './execution.service';
import { ExecutionTaskWorker } from './execution-task.worker';
import { ExecutionStepWorker } from './execution-step.worker';
import { ExecutionController } from './execution.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { AgentModule } from '../agent/agent.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    WebsocketModule,
    BullModule.registerQueue({ name: 'tasks' }),
    forwardRef(() => AgentModule),
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService, ExecutionTaskWorker, ExecutionStepWorker],
  exports: [ExecutionService],
})
export class ExecutionModule {}
