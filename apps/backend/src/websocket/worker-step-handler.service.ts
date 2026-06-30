import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { TaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGateway } from './agent.gateway';
import { VerifierAgentService, ExecutionSummary, VerificationResult } from '../agent/verifier-agent.service';
import { LearningEngineService } from '../learning/learning-engine.service';
import { PreferenceMemoryService } from '../memory/preferences/preference-memory.service';
import { ArtifactStoreService } from '../digital-twin/artifact-store.service';
import { SessionManagerService } from '../agent/runtime/session-manager.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';
import { asRecord, toRiskLevel, extractDomain, extractPluginIds, sumWorkerDurations } from './worker-event.utils';

interface WorkerEventPayload {
  sessionId: string;
  event: string;
  data: Record<string, any>;
  timestamp: number;
}

@Injectable()
export class WorkerStepHandler {
  private readonly logger = new Logger(WorkerStepHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AgentGateway))
    private readonly gateway: AgentGateway,
    @Inject(forwardRef(() => VerifierAgentService))
    private readonly verifierAgent: VerifierAgentService,
    private readonly learningEngine: LearningEngineService,
    private readonly preferenceMemory: PreferenceMemoryService,
    private readonly artifactStore: ArtifactStoreService,
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
  ) {}

  async handleWorkerStarted(payload: WorkerEventPayload): Promise<void> {
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

  async handleStepStarted(payload: WorkerEventPayload): Promise<void> {
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
        riskLevel: toRiskLevel(plannedStep?.riskLevel),
        status: 'RUNNING',
        startedAt: new Date(payload.timestamp),
      },
    });

    await this.prisma.executionSession.update({
      where: { id: payload.sessionId },
      data: { currentStepIndex: Number(payload.data.stepIndex) },
    }).catch(() => undefined);
  }

  async handleStepCompleted(payload: WorkerEventPayload): Promise<void> {
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
        riskLevel: toRiskLevel(plannedStep?.riskLevel),
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

  async handleStepFailed(payload: WorkerEventPayload): Promise<void> {
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
        riskLevel: toRiskLevel(plannedStep?.riskLevel),
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

  async handleExecutionCompleted(payload: WorkerEventPayload): Promise<void> {
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

    const cancelled = session?.status === 'CANCELLED';
    const rawSuccess = payload.data.status === 'success';
    const completedAt = new Date(payload.timestamp);

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
      : sumWorkerDurations(payload.data.results);

    let verification: VerificationResult | null = null;
    if (session) {
      verification = await this.verifyWorkerExecution(
        session,
        payload,
        durationMs,
      );
    }

    const verifiedSuccess = verification ? verification.verified : rawSuccess;

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

      await this.gradeTrajectory(
        session,
        payload,
        verifiedSuccess,
        verification?.score,
      );
    }
  }

  async handleExecutionFailed(payload: WorkerEventPayload): Promise<void> {
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

      const metadata = asRecord(session.metadata);
      const plan = asRecord(session.plan);
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
        parsedGoal: asRecord(metadata?.parsedGoal) as any,
        plan: (session.plan as unknown as AgentPlan) ?? ({ steps: [] } as any),
        stepsCompleted,
        stepsFailed: failedRows.length,
        totalSteps: planSteps.length || Number(session.totalSteps || 0),
        errorHistory,
        durationMs,
        matchedPluginIds: extractPluginIds(session.plan, session.metadata),
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
        `[StepHandler] Verifier verdict for session ${session.id}: score=${verification.score} verified=${verification.verified} nextAction=${verification.nextAction}`,
      );

      return verification;
    } catch (error: any) {
      this.logger.warn(
        `[StepHandler] VerifierAgent failed on worker path: ${error.message}. Falling back to raw worker status.`,
      );
      return null;
    }
  }

  private async gradeTrajectory(
    session: { id: string; userId: string; metadata: unknown },
    payload: WorkerEventPayload,
    verifiedSuccess: boolean,
    score?: number,
  ): Promise<void> {
    try {
      const stepCount = await this.prisma.trajectoryStep.count({
        where: { sessionId: session.id },
      });
      if (stepCount === 0) return;

      const metadata = asRecord(session.metadata);
      const goal =
        (typeof metadata?.goal === 'string' && metadata.goal) || null;
      const grade = verifiedSuccess ? 'GOLD' : 'REJECTED';
      const base = {
        userId: session.userId,
        goal,
        domain: extractDomain(session.metadata),
        grade: grade as any,
        outcome: payload.data.status ? String(payload.data.status) : null,
        score: Number.isFinite(Number(score)) ? Number(score) : null,
        steps: stepCount,
      };

      await this.prisma.trajectoryRun.upsert({
        where: { sessionId: session.id },
        update: base,
        create: { sessionId: session.id, ...base },
      });
      this.logger.log(
        `[StepHandler] Trajectory graded ${grade} for session ${session.id} (${stepCount} steps)`,
      );
    } catch (err: any) {
      this.logger.debug(`[StepHandler] gradeTrajectory failed: ${err.message}`);
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
    const domain = extractDomain(session.metadata);
    const pluginIds = extractPluginIds(session.plan, session.metadata);

    if (!domain || domain === 'general' || pluginIds.length === 0) {
      return;
    }

    await Promise.all(
      pluginIds.map(async (pluginId) => {
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
      }),
    );

    if (success) {
      const preferences = await this.preferenceMemory.getPreferences(session.userId);
      this.gateway.emitToSession(session.id, 'memory:preferences_updated', {
        sessionId: session.id,
        preferences,
        learnedFrom: pluginIds,
      });
    }
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
    const plan = asRecord(session?.plan);
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];

    return (
      steps.find((step) => {
        const stepRecord = asRecord(step);
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
}
