// apps/backend/src/websocket/websocket.module.ts

import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { WebsocketService } from './websocket.service';
import { AgentGateway } from './agent.gateway';
import { WorkerEventRelayService } from './worker-event-relay.service';
import { AgentModule } from '../agent/agent.module';
import { MemoryModule } from '../memory/memory.module';
import { DigitalTwinModule } from '../digital-twin/digital-twin.module';
import { RuntimeModule } from '../agent/runtime/runtime.module';

@Module({
  imports: [
    MemoryModule,
    LearningModule,
    DigitalTwinModule,
    forwardRef(() => AgentModule),
    // SessionManagerService (state authority) lives here — the relay maps the
    // worker's browser:state signals onto it.
    forwardRef(() => RuntimeModule),
  ],
  providers: [WebsocketService, AgentGateway, WorkerEventRelayService],
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
