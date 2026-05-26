import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId as string | undefined;
    if (userId) {
      client.join(userId);
      this.logger.log(`Client ${client.id} joined user room ${userId}`);
    }
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`📡 Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    this.logger.log(`ping from ${client.id}`);
    return { event: 'pong', data };
  }

  // 📡 EMIT EVENTS TO ALL CONNECTED CLIENTS
  emit(event: string, data: any) {
    this.logger.log(`📡 Broadcasting event: ${event}`);
    this.server.emit(event, data);
  }

  // 📡 EMIT TO SPECIFIC ROOM
  emitToRoom(room: string, event: string, data: any) {
    this.logger.log(`📡 Emitting to room ${room}: ${event}`);
    this.server.to(room).emit(event, data);
  }

  // 📡 EMIT TO SPECIFIC USER
  emitToUser(userId: string, event: string, data: any) {
    this.logger.log(`📡 Emitting to user ${userId}: ${event}`);
    this.server.to(userId).emit(event, data);
  }
}
