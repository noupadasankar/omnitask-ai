import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import * as Redis from 'ioredis';
import { AgentGateway } from './agent.gateway';
import { WorkerStepHandler } from './worker-step-handler.service';
import { WorkerInteractionHandler } from './worker-interaction-handler.service';
import { WorkerDataHandler } from './worker-data-handler.service';
import {
  SessionManagerService,
  BrowserState,
} from '../agent/runtime/session-manager.service';

export const WORKER_EVENT_CHANNEL = 'omnitask:worker:events';
export const WORKER_INPUT_CHANNEL = 'omnitask:worker:input';

interface WorkerEventPayload {
  sessionId: string;
  event: string;
  data: Record<string, any>;
  timestamp: number;
}

@Injectable()
export class WorkerEventRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerEventRelayService.name);
  private readonly subscriber: Redis.Redis;
  private readonly publisher: Redis.Redis;

  constructor(
    @Inject(forwardRef(() => AgentGateway))
    private readonly gateway: AgentGateway,
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
    private readonly stepHandler: WorkerStepHandler,
    private readonly interactionHandler: WorkerInteractionHandler,
    private readonly dataHandler: WorkerDataHandler,
  ) {
    const redisOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
    };
    this.subscriber = new Redis.Redis(redisOptions);
    this.publisher = new Redis.Redis(redisOptions);
  }

  async onModuleInit() {
    try {
      await this.subscriber.connect();
      await this.subscriber.subscribe(WORKER_EVENT_CHANNEL);
      await this.publisher.connect().catch((error: any) =>
        this.logger.warn(`[Relay] Input publisher connect failed: ${error.message}`),
      );

      this.subscriber.on('message', async (_channel: string, message: string) => {
        try {
          const payload = JSON.parse(message) as WorkerEventPayload;
          await this.handleWorkerEvent(payload);
        } catch (error: any) {
          this.logger.warn(
            `[Relay] Failed to parse worker message: ${error.message}`,
          );
        }
      });

      this.logger.log(
        `[Relay] Subscribed to Redis channel: ${WORKER_EVENT_CHANNEL}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[Relay] Redis subscribe failed: ${error.message}. Worker events will not reach the frontend.`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.subscriber.unsubscribe(WORKER_EVENT_CHANNEL);
      await this.subscriber.quit();
    } catch {
      // ignore shutdown errors
    }
    try {
      await this.publisher.quit();
    } catch {
      // ignore shutdown errors
    }
  }

  async sendInput(
    sessionId: string,
    input: Record<string, any>,
  ): Promise<void> {
    try {
      if (this.publisher.status !== 'ready') {
        await this.publisher.connect().catch(() => undefined);
      }
      await this.publisher.publish(
        WORKER_INPUT_CHANNEL,
        JSON.stringify({ sessionId, ...input }),
      );
    } catch (error: any) {
      this.logger.debug(`[Relay] sendInput failed: ${error.message}`);
    }
  }

  async setApprovalDecision(
    sessionId: string,
    stepIndex: number,
    decision: 'APPROVED' | 'DENIED',
  ): Promise<void> {
    const key = `omnitask:approval:${sessionId}:${stepIndex}`;
    await this.subscriber.set(key, decision, 'EX', 300);
    this.logger.log(`[Relay] Approval decision set: ${key} = ${decision}`);
  }

  async setClarificationAnswer(
    sessionId: string,
    answers: string,
  ): Promise<void> {
    const key = `omnitask:clarification:${sessionId}`;
    await this.subscriber.set(key, answers, 'EX', 600);
    this.logger.log(
      `[Relay] Clarification answer stored for session ${sessionId}`,
    );
  }

  async getClarificationAnswer(sessionId: string): Promise<string | null> {
    const key = `omnitask:clarification:${sessionId}`;
    const value = await this.subscriber.get(key);
    if (value) {
      await this.subscriber.del(key);
    }
    return value;
  }

  private async handleWorkerEvent(payload: WorkerEventPayload): Promise<void> {
    this.logger.debug(
      `[Relay] Worker event "${payload.event}" -> session ${payload.sessionId}`,
    );

    if (payload.event === 'worker:browser_state') {
      const state = payload.data?.state as BrowserState | undefined;
      if (state) {
        this.sessionManager.transitionBrowserState(payload.sessionId, state);
      }
      return;
    }

    this.gateway.emitToSession(payload.sessionId, payload.event, payload.data);

    switch (payload.event) {
      case 'session:worker:started':
        await this.stepHandler.handleWorkerStarted(payload);
        return;
      case 'step:started':
        await this.stepHandler.handleStepStarted(payload);
        return;
      case 'step:completed':
        await this.stepHandler.handleStepCompleted(payload);
        return;
      case 'step:failed':
        await this.stepHandler.handleStepFailed(payload);
        return;
      case 'execution:completed':
        await this.stepHandler.handleExecutionCompleted(payload);
        return;
      case 'execution:failed':
        await this.stepHandler.handleExecutionFailed(payload);
        return;
      case 'approval:required':
        await this.interactionHandler.handleApprovalRequired(payload);
        return;
      case 'step:denied':
        await this.interactionHandler.handleStepDenied(payload);
        return;
      case 'self_healing:required':
        const healingResult = await this.interactionHandler.handleSelfHealing(payload);
        const healingKey = `omnitask:healing:${payload.sessionId}:${healingResult.stepIndex}`;
        await this.subscriber.set(healingKey, JSON.stringify(healingResult.result), 'EX', 120);
        this.logger.log(
          `[Relay] Self-healing decision written to Redis: ${healingKey} healed=${healingResult.result.healed}`,
        );
        return;
      case 'agent:result':
        await this.dataHandler.handleAgentResult(payload);
        return;
      case 'application:result':
        await this.dataHandler.handleApplicationResult(payload);
        return;
      case 'trajectory:step':
        await this.dataHandler.handleTrajectoryStep(payload);
        return;
      default:
        return;
    }
  }
}
