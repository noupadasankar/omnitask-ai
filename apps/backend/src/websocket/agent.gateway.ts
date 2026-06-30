import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ExecutionEngineService } from '../agent/execution-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerEventRelayService } from './worker-event-relay.service';
import { ApprovalRespondSchema, BrowserInputSchema, ClarificationResponseSchema, SessionActionSchema, SessionJoinSchema, SessionLeaveSchema } from './gateway.dto';
import { z } from 'zod';

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

  private validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new WsException(`Validation failed: ${result.error.message}`);
    }
    return result.data;
  }

  constructor(
    @Inject(forwardRef(() => ExecutionEngineService))
    private executionEngine: ExecutionEngineService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => WorkerEventRelayService))
    private relay: WorkerEventRelayService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn(`WS connection rejected (no token): ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub as string;
      (client as any).userId = userId;
      client.join(userId);
      this.logger.log(`Client ${client.id} authenticated as user ${userId}`);
    } catch {
      this.logger.warn(`WS connection rejected (invalid token): ${client.id}`);
      client.disconnect();
    }
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
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    const validated = this.validate(SessionJoinSchema, data);
    client.join(validated.sessionId);
    this.logger.log(`Client joined session: ${validated.sessionId}`);
    return { success: true };
  }

  @SubscribeMessage('session:leave')
  handleSessionLeave(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    const validated = this.validate(SessionLeaveSchema, data);
    client.leave(validated.sessionId);
    this.logger.log(`Client left session: ${validated.sessionId}`);
    return { success: true };
  }

  // ─── Approval ────────────────────────────────────────────────────────────────
  //
  // Two paths:
  //   1. In-process (ExecutionEngineService) — for sessions running in API process
  //   2. Redis key (WorkerEventRelayService) — for sessions running in Worker

  @SubscribeMessage('approval:respond')
  async handleApprovalResponse(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
    ) {
    try {
      const validated = this.validate(ApprovalRespondSchema, data);

      const approval = await this.prisma.approvalRequest.findUnique({
        where: { id: validated.approvalRequestId },
      });

      // Path 1: In-process approval (execution engine holds approval promise)
      await this.executionEngine.handleApprovalResponse(
        validated.approvalRequestId,
        validated.status,
      );

      // Path 2: Worker approval via Redis key
      const sessionId = validated.sessionId || approval?.sessionId;
      const stepIndex = validated.stepIndex ?? approval?.stepIndex;
      if (sessionId && stepIndex !== undefined) {
        await this.relay.setApprovalDecision(
          sessionId,
          stepIndex,
          validated.status,
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
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    const validated = this.validate(BrowserInputSchema, data);
    const sessionId = validated.sessionId;
    if (!sessionId) return { success: false, error: 'sessionId required' };
    const { sessionId: _sid, ...input } = validated;
    await this.relay.sendInput(sessionId, input);
    return { success: true };
  }

  // ─── Clarification ───────────────────────────────────────────────────────────
  //
  // Frontend sends 'clarification:response' when user answers the questions
  // the GoalUnderstandingService emitted as 'clarification:required'.

  @SubscribeMessage('clarification:response')
  async handleClarificationResponse(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const validated = this.validate(ClarificationResponseSchema, data);
      this.logger.log(`Clarification response for session ${validated.sessionId}`);

      // Store answer in Redis — ExecutionEngine polls this key
      await this.relay.setClarificationAnswer(validated.sessionId, validated.answers);

      // Emit acknowledgment so the frontend knows we received the answer
      this.emitToSession(validated.sessionId, 'clarification:received', {
        sessionId: validated.sessionId,
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
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const validated = this.validate(SessionActionSchema, data);
      await this.executionEngine.pauseExecution(validated.sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('session:resume')
  async handleSessionResume(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const validated = this.validate(SessionActionSchema, data);
      await this.executionEngine.resumeExecution(validated.sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('session:cancel')
  async handleSessionCancel(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const validated = this.validate(SessionActionSchema, data);
      await this.executionEngine.cancelExecution(validated.sessionId);
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
