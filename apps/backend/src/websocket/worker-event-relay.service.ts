import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApprovalStatus, RiskLevel, TaskStatus, JobApplicationStatus, Prisma } from '@prisma/client';
import * as Redis from 'ioredis';
import { SelfHealingService } from '../agent/self-healing.service';
import {
  VerifierAgentService,
  ExecutionSummary,
  VerificationResult,
} from '../agent/verifier-agent.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';
import { LearningEngineService } from '../learning/learning-engine.service';
import { PreferenceMemoryService } from '../memory/preferences/preference-memory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGateway } from './agent.gateway';
import { ArtifactStoreService } from '../digital-twin/artifact-store.service';
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
  // Dedicated publisher — the subscriber connection is in subscribe mode and
  // can't issue publish/set, so input forwarding uses its own client.
  private readonly publisher: Redis.Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly preferenceMemory: PreferenceMemoryService,
    private readonly learningEngine: LearningEngineService,
    @Inject(forwardRef(() => AgentGateway))
    private readonly gateway: AgentGateway,
    @Inject(forwardRef(() => SelfHealingService))
    private readonly selfHealing: SelfHealingService,
    @Inject(forwardRef(() => VerifierAgentService))
    private readonly verifierAgent: VerifierAgentService,
    private readonly artifactStore: ArtifactStoreService,
    // The worker's browser:state signals are mapped onto the single authority.
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
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

  /**
   * Forward a "Take Control" input event from the dashboard to the Python
   * engine driving the live browser. The InputController (apps/browser-py)
   * subscribes to WORKER_INPUT_CHANNEL and dispatches onto the active page.
   *
   * Coordinates are expected pre-scaled to the frame's CSS pixels (e.g.
   * 1280x800) by the frontend, so they map 1:1 onto the Playwright viewport.
   * Fire-and-forget: a failed publish must never break the socket handler.
   */
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

    // OWNERSHIP RULE: the worker reports a browser-lifecycle SIGNAL; only the
    // SessionManager authority may emit the canonical `browser:state`. So we
    // route this signal into the state machine and do NOT blanket-forward it.
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
        await this.handleWorkerStarted(payload);
        return;
      case 'step:started':
        await this.handleStepStarted(payload);
        return;
      case 'approval:required':
        await this.handleApprovalRequired(payload);
        return;
      case 'step:completed':
        await this.handleStepCompleted(payload);
        return;
      case 'step:failed':
        await this.handleStepFailed(payload);
        return;
      case 'step:denied':
        await this.handleStepDenied(payload);
        return;
      case 'execution:completed':
        await this.handleExecutionCompleted(payload);
        return;
      case 'execution:failed':
        await this.handleExecutionFailed(payload);
        return;
      case 'self_healing:required':
        await this.handleSelfHealing(payload);
        return;
      case 'agent:result':
        await this.handleAgentResult(payload);
        return;
      case 'application:result':
        await this.handleApplicationResult(payload);
        return;
      default:
        return;
    }
  }

  private async handleWorkerStarted(payload: WorkerEventPayload): Promise<void> {
    // NOTE: do NOT set status:'RUNNING' here. `session:worker:started` fires
    // before Chromium launches — the execution status is derived from the
    // worker's `worker:browser_state` RUNNING signal via the state authority.
    await this.prisma.executionSession.update({
      where: { id: payload.sessionId },
      data: {
        totalSteps: Number(payload.data.totalSteps || 0),
        startedAt: new Date(),
      },
    }).catch(() => undefined);

    const taskId = await this.lookupTaskId(payload.sessionId);
    if (taskId) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.RUNNING,
          startedAt: new Date(),
        },
      }).catch(() => undefined);
    }
  }

  private async handleStepStarted(payload: WorkerEventPayload): Promise<void> {
    const plannedStep = await this.loadPlannedStep(
      payload.sessionId,
      Number(payload.data.stepIndex),
    );

    await this.prisma.agentExecutionStep.upsert({
      where: {
        sessionId_stepIndex: {
          sessionId: payload.sessionId,
          stepIndex: Number(payload.data.stepIndex),
        },
      },
      update: {
        action: payload.data.action || plannedStep?.action || 'wait',
        target: payload.data.target || plannedStep?.target || null,
        value: payload.data.value || plannedStep?.value || null,
        description:
          payload.data.description || plannedStep?.description || 'Worker step',
        status: 'RUNNING',
        errorMessage: null,
        startedAt: new Date(payload.timestamp),
      },
      create: {
        sessionId: payload.sessionId,
        stepIndex: Number(payload.data.stepIndex),
        action: payload.data.action || plannedStep?.action || 'wait',
        target: payload.data.target || plannedStep?.target || null,
        value: payload.data.value || plannedStep?.value || null,
        description:
          payload.data.description || plannedStep?.description || 'Worker step',
        riskLevel: this.toRiskLevel(plannedStep?.riskLevel),
        status: 'RUNNING',
        startedAt: new Date(payload.timestamp),
      },
    });

    await this.prisma.executionSession.update({
      where: { id: payload.sessionId },
      data: { currentStepIndex: Number(payload.data.stepIndex) },
    }).catch(() => undefined);
  }

  private async handleApprovalRequired(
    payload: WorkerEventPayload,
  ): Promise<void> {
    const stepIndex = Number(payload.data.stepIndex);
    const plannedStep = await this.loadPlannedStep(payload.sessionId, stepIndex);
    const existing = await this.prisma.approvalRequest.findFirst({
      where: {
        sessionId: payload.sessionId,
        stepIndex,
        status: ApprovalStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    const approval =
      existing ||
      (await this.prisma.approvalRequest.create({
        data: {
          sessionId: payload.sessionId,
          stepIndex,
          riskLevel: this.toRiskLevel(plannedStep?.riskLevel, RiskLevel.HIGH),
          description:
            payload.data.description ||
            plannedStep?.description ||
            'Worker approval required',
          actionDetails: {
            action: payload.data.action || plannedStep?.action || 'click',
            target: payload.data.target || plannedStep?.target || null,
            value: payload.data.value || plannedStep?.value || null,
            description:
              payload.data.description ||
              plannedStep?.description ||
              'Worker approval required',
          } as any,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      }));

    await this.prisma.executionSession.update({
      where: { id: payload.sessionId },
      data: { status: 'WAITING_APPROVAL' },
    }).catch(() => undefined);

    await this.prisma.agentExecutionStep.upsert({
      where: {
        sessionId_stepIndex: {
          sessionId: payload.sessionId,
          stepIndex,
        },
      },
      update: {
        status: 'WAITING_APPROVAL',
        action: payload.data.action || plannedStep?.action || 'click',
        target: payload.data.target || plannedStep?.target || null,
        value: payload.data.value || plannedStep?.value || null,
        description:
          payload.data.description || plannedStep?.description || 'Approval step',
      },
      create: {
        sessionId: payload.sessionId,
        stepIndex,
        action: payload.data.action || plannedStep?.action || 'click',
        target: payload.data.target || plannedStep?.target || null,
        value: payload.data.value || plannedStep?.value || null,
        description:
          payload.data.description || plannedStep?.description || 'Approval step',
        riskLevel: this.toRiskLevel(plannedStep?.riskLevel, RiskLevel.HIGH),
        status: 'WAITING_APPROVAL',
      },
    });

    this.gateway.emitToSession(payload.sessionId, 'approval:requested', {
      approvalRequestId: approval.id,
      stepIndex,
      riskLevel: approval.riskLevel,
      actionDetails: approval.actionDetails,
      expiresAt: approval.expiresAt,
    });
  }

  private async handleStepCompleted(payload: WorkerEventPayload): Promise<void> {
    const stepIndex = Number(payload.data.stepIndex);
    const plannedStep = await this.loadPlannedStep(payload.sessionId, stepIndex);

    await this.prisma.agentExecutionStep.upsert({
      where: {
        sessionId_stepIndex: {
          sessionId: payload.sessionId,
          stepIndex,
        },
      },
      update: {
        action: plannedStep?.action || payload.data.action || 'wait',
        target: plannedStep?.target || payload.data.target || null,
        value: plannedStep?.value || payload.data.value || null,
        description:
          payload.data.description || plannedStep?.description || 'Worker step',
        status: 'COMPLETED',
        result: payload.data.data || {},
        errorMessage: null,
        completedAt: new Date(payload.timestamp),
        durationMs: Number(payload.data.durationMs || 0),
      },
      create: {
        sessionId: payload.sessionId,
        stepIndex,
        action: plannedStep?.action || payload.data.action || 'wait',
        target: plannedStep?.target || payload.data.target || null,
        value: plannedStep?.value || payload.data.value || null,
        description:
          payload.data.description || plannedStep?.description || 'Worker step',
        riskLevel: this.toRiskLevel(plannedStep?.riskLevel),
        status: 'COMPLETED',
        result: payload.data.data || {},
        completedAt: new Date(payload.timestamp),
        durationMs: Number(payload.data.durationMs || 0),
      },
    });

    await this.persistStepScreenshot(
      payload.sessionId,
      stepIndex,
      payload.data.screenshot,
      payload.timestamp,
    );

    await this.prisma.executionSession.update({
      where: { id: payload.sessionId },
      data: {
        status: 'RUNNING',
        currentStepIndex: stepIndex + 1,
      },
    }).catch(() => undefined);
  }

  private async handleStepFailed(payload: WorkerEventPayload): Promise<void> {
    const stepIndex = Number(payload.data.stepIndex);
    const plannedStep = await this.loadPlannedStep(payload.sessionId, stepIndex);

    await this.prisma.agentExecutionStep.upsert({
      where: {
        sessionId_stepIndex: {
          sessionId: payload.sessionId,
          stepIndex,
        },
      },
      update: {
        action: plannedStep?.action || payload.data.action || 'wait',
        target: plannedStep?.target || payload.data.target || null,
        value: plannedStep?.value || payload.data.value || null,
        description:
          plannedStep?.description || payload.data.description || 'Worker step',
        status: 'FAILED',
        errorMessage: payload.data.error || 'Worker step failed',
        completedAt: new Date(payload.timestamp),
        durationMs: Number(payload.data.durationMs || 0),
      },
      create: {
        sessionId: payload.sessionId,
        stepIndex,
        action: plannedStep?.action || payload.data.action || 'wait',
        target: plannedStep?.target || payload.data.target || null,
        value: plannedStep?.value || payload.data.value || null,
        description:
          plannedStep?.description || payload.data.description || 'Worker step',
        riskLevel: this.toRiskLevel(plannedStep?.riskLevel),
        status: 'FAILED',
        errorMessage: payload.data.error || 'Worker step failed',
        completedAt: new Date(payload.timestamp),
        durationMs: Number(payload.data.durationMs || 0),
      },
    });

    await this.persistStepScreenshot(
      payload.sessionId,
      stepIndex,
      payload.data.screenshot,
      payload.timestamp,
    );
  }

  private async handleStepDenied(payload: WorkerEventPayload): Promise<void> {
    const stepIndex = Number(payload.data.stepIndex);

    await this.prisma.agentExecutionStep.updateMany({
      where: {
        sessionId: payload.sessionId,
        stepIndex,
      },
      data: {
        status: 'FAILED',
        errorMessage: payload.data.reason || 'Approval denied or timed out',
        completedAt: new Date(payload.timestamp),
      },
    });

    await this.prisma.approvalRequest.updateMany({
      where: {
        sessionId: payload.sessionId,
        stepIndex,
        status: ApprovalStatus.PENDING,
      },
      data: {
        status: ApprovalStatus.REJECTED,
        respondedAt: new Date(payload.timestamp),
        respondedBy: 'worker-timeout',
      },
    }).catch(() => undefined);
  }

  private async handleExecutionCompleted(
    payload: WorkerEventPayload,
  ): Promise<void> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: payload.sessionId },
      select: {
        id: true,
        taskId: true,
        userId: true,
        status: true,
        startedAt: true,
        totalSteps: true,
        plan: true,
        metadata: true,
        task: { select: { naturalLanguage: true } },
      },
    });

    // A user-cancelled session is terminal — don't let the engine's natural
    // completion flip CANCELLED to COMPLETED/FAILED.
    const cancelled = session?.status === 'CANCELLED';
    const rawSuccess = payload.data.status === 'success';
    const completedAt = new Date(payload.timestamp);

    // Persist the final post-execution screenshot captured by the engine.
    if (typeof payload.data.finalScreenshot === 'string') {
      await this.persistStepScreenshot(
        payload.sessionId,
        -1,
        payload.data.finalScreenshot,
        payload.timestamp,
      );
    }

    const durationMs = session?.startedAt
      ? completedAt.getTime() - session.startedAt.getTime()
      : this.sumWorkerDurations(payload.data.results);

    // ── Verified Learning Loop: run the VerifierAgent on the worker path so
    // ranking learns from *verified* goal achievement, not raw worker status.
    let verification: VerificationResult | null = null;
    if (session) {
      verification = await this.verifyWorkerExecution(
        session,
        payload,
        durationMs,
      );
    }

    // The verifier's `verified` flag (score >= 70) is the success signal for
    // learning; fall back to raw worker status if verification was unavailable.
    const verifiedSuccess = verification ? verification.verified : rawSuccess;

    // User-visible status stays driven by the worker's raw result (no flip).
    const errorMessage = rawSuccess
      ? null
      : 'Worker execution completed with failed or denied steps';

    if (!cancelled) {
      await this.prisma.executionSession.update({
        where: { id: payload.sessionId },
        data: {
          status: rawSuccess ? 'COMPLETED' : 'FAILED',
          completedAt,
          currentStepIndex: Number(payload.data.stepsCompleted || 0),
          errorMessage,
        },
      }).catch(() => undefined);

      if (session?.taskId) {
        await this.prisma.task.update({
          where: { id: session.taskId },
          data: {
            status: rawSuccess ? TaskStatus.COMPLETED : TaskStatus.FAILED,
            completedAt,
            errorMessage,
            result: payload.data as any,
          },
        }).catch(() => undefined);
      }
    }

    if (session) {
      await this.recordLearningFromSession(
        session,
        verifiedSuccess,
        durationMs,
        Number(payload.data.healedStepsCount || 0) > 0,
        verification?.confidence,
      );
    }
  }

  /**
   * Build an ExecutionSummary from worker-path data and run the VerifierAgent.
   * Emits the verdict to the UI (parity with the inline path). Never throws —
   * a verifier failure falls back to null so completion handling continues.
   */
  private async verifyWorkerExecution(
    session: {
      id: string;
      plan: unknown;
      metadata: unknown;
      totalSteps?: number;
      task?: { naturalLanguage: string } | null;
    },
    payload: WorkerEventPayload,
    durationMs: number,
  ): Promise<VerificationResult | null> {
    try {
      const stepRows = await this.prisma.agentExecutionStep.findMany({
        where: { sessionId: session.id },
        select: { status: true, errorMessage: true },
      });

      const metadata = this.asRecord(session.metadata);
      const plan = this.asRecord(session.plan);
      const planSteps = Array.isArray(plan?.steps) ? plan.steps : [];

      const stepsCompleted =
        stepRows.filter((s) => s.status === 'COMPLETED').length ||
        Number(payload.data.stepsCompleted || 0);
      const failedRows = stepRows.filter((s) => s.status === 'FAILED');
      const errorHistory = failedRows
        .map((s) => s.errorMessage)
        .filter((m): m is string => typeof m === 'string' && m.length > 0);

      const goal =
        (typeof metadata?.goal === 'string' && metadata.goal) ||
        session.task?.naturalLanguage ||
        '';

      const summary: ExecutionSummary = {
        goal,
        parsedGoal: this.asRecord(metadata?.parsedGoal) as any,
        plan: (session.plan as unknown as AgentPlan) ?? ({ steps: [] } as any),
        stepsCompleted,
        stepsFailed: failedRows.length,
        totalSteps: planSteps.length || Number(session.totalSteps || 0),
        errorHistory,
        durationMs,
        matchedPluginIds: this.extractPluginIds(session.plan, session.metadata),
      };

      const verification = await this.verifierAgent.verify(summary);

      this.gateway.emitToSession(session.id, 'execution:verified', {
        verified: verification.verified,
        confidence: verification.confidence,
        score: verification.score,
        summary: verification.summary,
        gaps: verification.gaps,
        achievements: verification.achievements,
        nextAction: verification.nextAction,
        reasoning: verification.reasoning,
        evidence: verification.evidence,
      });

      this.logger.log(
        `[Relay] Verifier verdict for session ${session.id}: score=${verification.score} verified=${verification.verified} nextAction=${verification.nextAction}`,
      );

      return verification;
    } catch (error: any) {
      this.logger.warn(
        `[Relay] VerifierAgent failed on worker path: ${error.message}. Falling back to raw worker status.`,
      );
      return null;
    }
  }

  private async handleExecutionFailed(payload: WorkerEventPayload): Promise<void> {
    const taskId = await this.lookupTaskId(payload.sessionId);
    const completedAt = new Date(payload.timestamp);
    const message = payload.data.message || 'Worker execution failed';

    await this.prisma.executionSession.update({
      where: { id: payload.sessionId },
      data: {
        status: 'FAILED',
        completedAt,
        errorMessage: message,
      },
    }).catch(() => undefined);

    if (taskId) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          completedAt,
          errorMessage: message,
        },
      }).catch(() => undefined);
    }
  }

  private async handleSelfHealing(
    payload: WorkerEventPayload,
  ): Promise<void> {
    const healingRequest = payload.data;

    this.gateway.emitToSession(payload.sessionId, 'vision:analysis_started', {
      sessionId: payload.sessionId,
      stepIndex: healingRequest.stepIndex,
      url: healingRequest.url,
    });

    const result = await this.selfHealing.attemptHealing({
      sessionId: payload.sessionId,
      stepIndex: healingRequest.stepIndex,
      action: healingRequest.action,
      target: healingRequest.target,
      value: healingRequest.value,
      description: healingRequest.description,
      error: healingRequest.error,
      screenshot: healingRequest.screenshot,
      url: healingRequest.url,
      title: healingRequest.title,
      rawDom: healingRequest.rawDom,
      viewport: healingRequest.viewport,
    });

    this.gateway.emitToSession(payload.sessionId, 'vision:analysis_complete', {
      sessionId: payload.sessionId,
      stepIndex: healingRequest.stepIndex,
      visionAnalysis: result.visionAnalysis,
    });

    if (result.healed) {
      this.gateway.emitToSession(payload.sessionId, 'healing:recovery_plan', {
        sessionId: payload.sessionId,
        stepIndex: healingRequest.stepIndex,
        recoveryType: result.recoveryType,
        explanation: result.explanation,
        confidence: result.confidence,
        alternativeSelector: result.alternativeSelector,
        attemptNumber: result.attemptNumber,
      });
    } else {
      this.gateway.emitToSession(payload.sessionId, 'healing:failed', {
        sessionId: payload.sessionId,
        stepIndex: healingRequest.stepIndex,
        explanation: result.explanation,
      });
    }

    const key = `omnitask:healing:${payload.sessionId}:${healingRequest.stepIndex}`;
    await this.subscriber.set(key, JSON.stringify(result), 'EX', 120);
    this.logger.log(
      `[Relay] Self-healing decision written to Redis: ${key} healed=${result.healed}`,
    );
  }

  /**
   * Persist structured skill output (jobs/products/research/etc.) emitted by the
   * Python engine into the Digital Twin so it is durable and queryable, not just
   * a transient socket frame.
   */
  private async handleAgentResult(payload: WorkerEventPayload): Promise<void> {
    const kind = String(payload.data.kind || 'result');
    const items = Array.isArray(payload.data.items) ? payload.data.items : [];
    if (items.length === 0) return;

    const session = await this.prisma.executionSession.findUnique({
      where: { id: payload.sessionId },
      select: { userId: true, metadata: true },
    });
    if (!session?.userId) return;

    const goal =
      (this.asRecord(session.metadata)?.goal as string) || 'Agent result';

    await this.artifactStore.record({
      userId: session.userId,
      sessionId: payload.sessionId,
      agent: kind,
      kind: 'RESULT_SET',
      title: `${kind}: ${goal}`.slice(0, 180),
      mimeType: 'application/json',
      data: { kind, count: items.length, items },
      tags: [kind],
    });
  }

  /**
   * Persist a job-application result emitted by the job_application skill.
   *
   * Upserts the JobApplication row (unique on userId+portal+externalJobId, so
   * re-applies dedupe) and links it to the ExecutionSession. The socket event
   * itself is already forwarded to the dashboard before this switch.
   */
  private async handleApplicationResult(payload: WorkerEventPayload): Promise<void> {
    const d = payload.data || {};
    const userId =
      (typeof d.userId === 'string' && d.userId) ||
      (await this.lookupUserId(payload.sessionId));
    const portal = typeof d.portal === 'string' ? d.portal : null;
    const externalJobId = d.externalJobId ? String(d.externalJobId) : null;
    if (!userId || !portal || !externalJobId) {
      this.logger.warn(
        `[Relay] application:result missing keys (user=${!!userId} portal=${portal} jobId=${externalJobId})`,
      );
      return;
    }

    const status = this.toJobStatus(d.status);
    const reasons = Array.isArray(d.matchReasons) ? d.matchReasons : [];
    const base = {
      title: typeof d.title === 'string' ? d.title : 'Unknown role',
      company: typeof d.company === 'string' ? d.company : null,
      location: typeof d.location === 'string' ? d.location : null,
      url: typeof d.url === 'string' ? d.url : null,
      score: Number.isFinite(Number(d.score)) ? Number(d.score) : 0,
      matchReasons: reasons as unknown as Prisma.InputJsonValue,
      status,
      sessionId: payload.sessionId,
      errorMessage: typeof d.error === 'string' ? d.error : null,
      ...(status === JobApplicationStatus.APPLIED
        ? { appliedAt: new Date(payload.timestamp) }
        : {}),
    };

    await this.prisma.jobApplication
      .upsert({
        where: { userId_portal_externalJobId: { userId, portal, externalJobId } },
        update: base,
        create: { userId, portal, externalJobId, ...base },
      })
      .catch((err) =>
        this.logger.warn(`[Relay] application:result upsert failed: ${err.message}`),
      );
  }

  private async lookupUserId(sessionId: string): Promise<string | null> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    return session?.userId || null;
  }

  private toJobStatus(value: unknown): JobApplicationStatus {
    switch (value) {
      case 'APPLIED':
        return JobApplicationStatus.APPLIED;
      case 'FAILED':
        return JobApplicationStatus.FAILED;
      case 'PENDING_APPROVAL':
        return JobApplicationStatus.PENDING_APPROVAL;
      case 'MATCHED':
        return JobApplicationStatus.MATCHED;
      case 'QUEUED':
      case 'PENDING':
        return JobApplicationStatus.QUEUED;
      case 'PROCESSING':
        return JobApplicationStatus.PROCESSING;
      case 'SKIPPED':
      default:
        return JobApplicationStatus.SKIPPED;
    }
  }

  private async recordLearningFromSession(
    session: {
      id: string;
      userId: string;
      plan: unknown;
      metadata: unknown;
    },
    success: boolean,
    durationMs: number,
    recovered: boolean,
    confidence?: number,
  ): Promise<void> {
    const domain = this.extractDomain(session.metadata);
    const pluginIds = this.extractPluginIds(session.plan, session.metadata);

    if (!domain || domain === 'general' || pluginIds.length === 0) {
      return;
    }

    for (const pluginId of pluginIds) {
      await this.learningEngine.recordRun(
        session.userId,
        domain,
        pluginId,
        success,
        durationMs,
        recovered,
        confidence,
      );

      if (success) {
        await this.preferenceMemory.autoLearn(session.userId, domain, pluginId);
      }
    }

    if (success) {
      const preferences = await this.preferenceMemory.getPreferences(session.userId);
      this.gateway.emitToSession(session.id, 'memory:preferences_updated', {
        sessionId: session.id,
        preferences,
        learnedFrom: pluginIds,
      });
    }
  }

  private extractPluginIds(plan: unknown, metadata: unknown): string[] {
    const ids = new Set<string>();
    const metadataRecord = this.asRecord(metadata);
    const planRecord = this.asRecord(plan);

    const matchedSkills = Array.isArray(metadataRecord?.matchedSkills)
      ? metadataRecord.matchedSkills
      : [];
    for (const skill of matchedSkills) {
      if (typeof skill === 'string' && skill.includes('-')) {
        ids.add(skill);
      }
    }

    const skillsUsed = Array.isArray(planRecord?.skillsUsed)
      ? planRecord.skillsUsed
      : [];
    for (const skill of skillsUsed) {
      if (typeof skill === 'string' && skill.includes('-')) {
        ids.add(skill);
      }
    }

    const steps = Array.isArray(planRecord?.steps) ? planRecord.steps : [];
    for (const step of steps) {
      const stepRecord = this.asRecord(step);
      if (
        typeof stepRecord?.skillName === 'string' &&
        stepRecord.skillName.includes('-')
      ) {
        ids.add(stepRecord.skillName);
      }
    }

    const branches = Array.isArray(this.asRecord(planRecord?.metadata)?.branches)
      ? (this.asRecord(planRecord?.metadata)?.branches as Array<Record<string, any>>)
      : [];
    for (const branch of branches) {
      if (typeof branch.id === 'string' && branch.id.includes('-')) {
        ids.add(branch.id);
      }
      if (typeof branch.skill === 'string' && branch.skill.includes('-')) {
        ids.add(branch.skill);
      }
    }

    return [...ids];
  }

  private extractDomain(metadata: unknown): string {
    const metadataRecord = this.asRecord(metadata);
    if (typeof metadataRecord?.routedDomain === 'string') {
      return metadataRecord.routedDomain;
    }

    const parsedGoal = this.asRecord(metadataRecord?.parsedGoal);
    const taskType = parsedGoal?.taskType;
    const categoryMap: Record<string, string> = {
      job_search: 'job',
      food_order: 'food',
      shopping: 'shopping',
      price_comparison: 'shopping',
      ticket_booking: 'travel',
      hotel_booking: 'travel',
      flight_search: 'travel',
      research: 'research',
    };

    return typeof taskType === 'string' ? categoryMap[taskType] || 'general' : 'general';
  }

  private async lookupTaskId(sessionId: string): Promise<string | null> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
      select: { taskId: true },
    });
    return session?.taskId || null;
  }

  private async loadPlannedStep(
    sessionId: string,
    stepIndex: number,
  ): Promise<Record<string, any> | null> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
      select: { plan: true },
    });
    const plan = this.asRecord(session?.plan);
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];

    return (
      steps.find((step) => {
        const stepRecord = this.asRecord(step);
        return Number(stepRecord?.index) === stepIndex;
      }) || null
    );
  }

  private async persistStepScreenshot(
    sessionId: string,
    stepIndex: number,
    screenshot: unknown,
    timestamp: number,
  ): Promise<void> {
    if (typeof screenshot !== 'string' || screenshot.length === 0) return;

    await this.prisma.screenshot.create({
      data: {
        sessionId,
        stepIndex,
        imageUrl: '',
        base64Thumbnail: screenshot,
        width: 1280,
        height: 800,
        timestamp: new Date(timestamp),
      },
    }).catch(() => undefined);
  }

  private sumWorkerDurations(results: unknown): number {
    if (!Array.isArray(results)) return 0;
    return results.reduce((total, result) => {
      const duration = this.asRecord(result)?.durationMs;
      return total + (typeof duration === 'number' ? duration : 0);
    }, 0);
  }

  private toRiskLevel(
    value: unknown,
    fallback: RiskLevel = RiskLevel.LOW,
  ): RiskLevel {
    switch (value) {
      case 'CRITICAL':
        return RiskLevel.CRITICAL;
      case 'HIGH':
        return RiskLevel.HIGH;
      case 'MEDIUM':
        return RiskLevel.MEDIUM;
      case 'LOW':
        return RiskLevel.LOW;
      default:
        return fallback;
    }
  }

  private asRecord(value: unknown): Record<string, any> | null {
    return value && typeof value === 'object' ? (value as Record<string, any>) : null;
  }
}
