import { Injectable, Logger } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';

@Injectable()
export class WebsocketService {
  private readonly logger = new Logger(WebsocketService.name);
  private gateway: AgentGateway | null = null;

  setGateway(gateway: AgentGateway) {
    this.gateway = gateway;
    this.logger.log('WebSocket gateway connected');
  }

  emitToRoom(room: string, event: string, data: unknown) {
    this.gateway?.emitToRoom(room, event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.gateway?.emitToUser(userId, event, data);
  }

  broadcast(event: string, data: unknown) {
    this.gateway?.emit(event, data);
  }
}
