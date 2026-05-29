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
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ExecutionEngineService } from '../agent/execution-engine.service';

@WebSocketGateway({
  namespace: '/agent',
  cors: {
    origin: [
      'http://localhost:3000',
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private sessionRooms = new Map<string, string>();

  constructor(
    @Inject(forwardRef(() => ExecutionEngineService))
    private executionEngine: ExecutionEngineService,
  ) {}

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

  @SubscribeMessage('session:join')
  handleSessionJoin(
    @MessageBody() data: { sessionId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.sessionId);
    this.sessionRooms.set(client.id, data.sessionId);
    this.logger.log(`Client joined session: ${data.sessionId}`);
    return { success: true };
  }

  @SubscribeMessage('session:leave')
  handleSessionLeave(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(data.sessionId);
    this.sessionRooms.delete(client.id);
    this.logger.log(`Client left session: ${data.sessionId}`);
    return { success: true };
  }

  @SubscribeMessage('approval:respond')
  async handleApprovalResponse(
    @MessageBody() data: { approvalRequestId: string; status: 'APPROVED' | 'DENIED' },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.executionEngine.handleApprovalResponse(
        data.approvalRequestId,
        data.status,
      );
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Approval response error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('session:pause')
  async handleSessionPause(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.executionEngine.pauseExecution(data.sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('session:resume')
  async handleSessionResume(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.executionEngine.resumeExecution(data.sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('session:cancel')
  async handleSessionCancel(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.executionEngine.cancelExecution(data.sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
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

  // 📡 EMIT TO SPECIFIC SESSION
  emitToSession(sessionId: string, event: string, data: any) {
    this.logger.debug(`📡 Emitting to session ${sessionId}: ${event}`);
    this.server.to(sessionId).emit(event, data);
  }
}

