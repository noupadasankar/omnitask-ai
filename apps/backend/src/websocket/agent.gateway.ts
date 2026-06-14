// apps/backend/src/websocket/agent.gateway.ts
//
// WebSocket Gateway — upgraded with:
//   • clarification:required  (emit to frontend when goal is ambiguous)
//   • clarification:response  (receive user answers, store in Redis, resume engine)
//   • approval:respond        (now also writes decision to Redis for Worker)
//   • All existing events preserved

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
import { PrismaService } from '../prisma/prisma.service';
import { WorkerEventRelayService } from './worker-event-relay.service';

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

  constructor(
    @Inject(forwardRef(() => ExecutionEngineService))
    private executionEngine: ExecutionEngineService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => WorkerEventRelayService))
    private relay: WorkerEventRelayService,
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
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Session Room ────────────────────────────────────────────────────────────

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
    this.logger.log(`Client joined session: ${data.sessionId}`);
    return { success: true };
  }

  @SubscribeMessage('session:leave')
  handleSessionLeave(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(data.sessionId);
    this.logger.log(`Client left session: ${data.sessionId}`);
    return { success: true };
  }

  // ─── Approval ────────────────────────────────────────────────────────────────
  //
  // Two paths:
  //   1. In-process (ExecutionEngineService) — for sessions running in API process
  //   2. Redis key (WorkerEventRelayService) — for sessions running in Worker

  @SubscribeMessage('approval:respond')
  async handleApprovalResponse(
    @MessageBody()
    data: {
      approvalRequestId: string;
      sessionId?: string;
      stepIndex?: number;
      status: 'APPROVED' | 'DENIED';
    },
    @ConnectedSocket() client: Socket,
    ) {
    try {
      const approval = await this.prisma.approvalRequest.findUnique({
        where: { id: data.approvalRequestId },
      });

      // Path 1: In-process approval (execution engine holds approval promise)
      await this.executionEngine.handleApprovalResponse(
        data.approvalRequestId,
        data.status,
      );

      // Path 2: Worker approval via Redis key
      const sessionId = data.sessionId || approval?.sessionId;
      const stepIndex = data.stepIndex ?? approval?.stepIndex;
      if (sessionId && stepIndex !== undefined) {
        await this.relay.setApprovalDecision(
          sessionId,
          stepIndex,
          data.status,
        );
      }

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Approval response error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ─── Take Control (remote input forwarding) ──────────────────────────────────
  //
  // When the user enables "Take Control" in the live view and clicks/types/
  // scrolls on the canvas, the frontend emits `browser:input`. We forward it to
  // the Python engine over Redis (WORKER_INPUT_CHANNEL); the InputController
  // dispatches it onto the real Chromium page. High-frequency + fire-and-forget,
  // so we don't await/ack to keep latency low.

  @SubscribeMessage('browser:input')
  async handleBrowserInput(
    @MessageBody()
    data: { sessionId: string } & Record<string, any>,
    @ConnectedSocket() client: Socket,
  ) {
    const sessionId = data?.sessionId;
    if (!sessionId) return { success: false, error: 'sessionId required' };
    const { sessionId: _sid, ...input } = data;
    await this.relay.sendInput(sessionId, input);
    return { success: true };
  }

  // ─── Clarification ───────────────────────────────────────────────────────────
  //
  // Frontend sends 'clarification:response' when user answers the questions
  // the GoalUnderstandingService emitted as 'clarification:required'.

  @SubscribeMessage('clarification:response')
  async handleClarificationResponse(
    @MessageBody()
    data: {
      sessionId: string;
      answers: string; // user's natural-language answer to the clarifying questions
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log(`Clarification response for session ${data.sessionId}`);

      // Store answer in Redis — ExecutionEngine polls this key
      await this.relay.setClarificationAnswer(data.sessionId, data.answers);

      // Emit acknowledgment so the frontend knows we received the answer
      this.emitToSession(data.sessionId, 'clarification:received', {
        sessionId: data.sessionId,
        message: 'Clarification received. Resuming planning...',
      });

      return { success: true };
    } catch (err: any) {
      this.logger.error(`Clarification response error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ─── Session Control ─────────────────────────────────────────────────────────

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

  // ─── Emit Helpers ────────────────────────────────────────────────────────────

  emit(event: string, data: any) {
    this.server.emit(event, data);
  }

  emitToRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(userId).emit(event, data);
  }

  emitToSession(sessionId: string, event: string, data: any) {
    this.logger.debug(`📡 → session ${sessionId}: ${event}`);
    this.server.to(sessionId).emit(event, data);
  }
}
