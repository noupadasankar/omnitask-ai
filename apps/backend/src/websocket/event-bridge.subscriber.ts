import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentGateway } from './agent.gateway';

@Injectable()
export class EventBridgeSubscriber implements OnModuleInit {
  constructor(
    @Inject(EventEmitter2) private readonly emitter: EventEmitter2,
    private readonly gateway: AgentGateway,
  ) {}

  onModuleInit() {
    this.emitter.on('execution:ws:emit', (data: { sessionId: string; event: string; payload: any }) => {
      this.gateway.emitToSession(data.sessionId, data.event, data.payload);
    });
  }
}
