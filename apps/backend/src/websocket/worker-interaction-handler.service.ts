import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApprovalStatus, RiskLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGateway } from './agent.gateway';
import { SelfHealingService } from '../agent/self-healing.service';
import { asRecord, toRiskLevel } from './worker-event.utils';

interface WorkerEventPayload {
  sessionId: string;
  event: string;
  data: Record<string, any>;
  timestamp: number;
}

@Injectable()
export class WorkerInteractionHandler {
  private readonly logger = new Logger(WorkerInteractionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AgentGateway))
    private readonly gateway: AgentGateway,
    @Inject(forwardRef(() => SelfHealingService))
    private readonly selfHealing: SelfHealingService,
  ) {}

  async handleApprovalRequired(payload: WorkerEventPayload): Promise<void> {
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
          riskLevel: toRiskLevel(plannedStep?.riskLevel, RiskLevel.HIGH),
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
        riskLevel: toRiskLevel(plannedStep?.riskLevel, RiskLevel.HIGH),
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

  async handleStepDenied(payload: WorkerEventPayload): Promise<void> {
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

  async handleSelfHealing(payload: WorkerEventPayload): Promise<{
    result: any;
    stepIndex: number;
  }> {
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

    return { result, stepIndex: healingRequest.stepIndex };
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
}
