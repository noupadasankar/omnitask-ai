import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { WebsocketService } from './websocket.service';
import { AgentGateway } from './agent.gateway';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [forwardRef(() => AgentModule)],
  providers: [WebsocketService, AgentGateway],
  exports: [WebsocketService, AgentGateway],
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
