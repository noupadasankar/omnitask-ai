// apps/backend/src/websocket/websocket.module.ts

import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { LearningModule } from '../learning/learning.module';
import { WebsocketService } from './websocket.service';
import { AgentGateway } from './agent.gateway';
import { WorkerEventRelayService } from './worker-event-relay.service';
import { WorkerStepHandler } from './worker-step-handler.service';
import { WorkerInteractionHandler } from './worker-interaction-handler.service';
import { WorkerDataHandler } from './worker-data-handler.service';
import { AgentModule } from '../agent/agent.module';
import { MemoryModule } from '../memory/memory.module';
import { DigitalTwinModule } from '../digital-twin/digital-twin.module';
import { RuntimeModule } from '../agent/runtime/runtime.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    MemoryModule,
    LearningModule,
    DigitalTwinModule,
    PrismaModule,
    forwardRef(() => AgentModule),
    forwardRef(() => RuntimeModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') } as jwt.SignOptions,
      }),
    }),
  ],
  providers: [
    WebsocketService,
    AgentGateway,
    WorkerEventRelayService,
    WorkerStepHandler,
    WorkerInteractionHandler,
    WorkerDataHandler,
  ],
  exports: [WebsocketService, AgentGateway, WorkerEventRelayService],
})
export class WebsocketModule implements OnModuleInit {
  constructor(
    private readonly websocketService: WebsocketService,
    private readonly agentGateway: AgentGateway,
  ) {}

  onModuleInit() {
    this.websocketService.setGateway(this.agentGateway);
  }
}
