// backend/src/agent/execution-engine.service.ts

import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserAgentService } from './browser-agent.service';
import { PlannerAgentService } from './planner-agent.service';
import { VisionAgentService } from './vision-agent.service';
import { PolicyEngineService } from './policy-engine.service';
import { ScreenshotStreamerService } from './screenshot-streamer.service';
import { MemoryService } from '../memory/memory.service';
import { AgentGateway } from '../websocket/agent.gateway';
import {
  AgentPlan,
  PlannedStep,
  ExecutionEventType,
  BrowserSessionConfig,
  WaitCondition,
} from '../shared/interfaces/agent.interfaces';
import { ApprovalStatus, RiskLevel, MemoryType } from '@prisma/client';

@Injectable()
export class ExecutionEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(ExecutionEngineService.name);
  private activeSessions = new Map<string, { sessionId: string; aborting: boolean }>();
  private approvalTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private browserAgent: BrowserAgentService,
    private plannerAgent: PlannerAgentService,
    private visionAgent: VisionAgentService,
    private policyEngine: PolicyEngineService,
    @Inject(forwardRef(() => ScreenshotStreamerService))
    private screenshotStreamer: ScreenshotStreamerService,
    private memory: MemoryService,
    @Inject(forwardRef(() => AgentGateway))
    private wsGateway: AgentGateway,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleDestroy() {
    for (const [sessionId] of this.activeSessions) {
      await this.cancelExecution(sessionId);
    }
  }

  // ─── Main Execution Flow ────────────────────────────────

  async startExecution(
    userId: string,
    taskId: string,
    goal: string,
    config?: Partial<BrowserSessionConfig>,
  ): Promise<string> {
    const sessionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(`Starting execution: ${sessionId} for goal: "${goal}"`);

    const session = await this.prisma.executionSession.create({
      data: {
        id: sessionId,
        taskId,
        userId,
        status: 'PLANNING',
        metadata: { goal },
        currentStepIndex: 0,
      },
    });

    this.activeSessions.set(sessionId, { sessionId, aborting: false });
    this.wsGateway.emitToSession(sessionId, 'session:started', { sessionId });

    setImmediate(() => this.runExecution(sessionId, goal, config));

    return sessionId;
  }

  private async runExecution(
    sessionId: string,
    goal: string,
    config?: Partial<BrowserSessionConfig>,
  ): Promise<void> {
    try {
      const session = await this.prisma.executionSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        this.logger.error(`Session not found: ${sessionId}`);
        return;
      }

      // Step 1: Create plan
      this.wsGateway.emitToSession(sessionId, 'execution:event', {
        type: 'plan:creating' as ExecutionEventType,
        data: { goal },
      });

      const plan = await this.plannerAgent.createPlan(goal, {
        userPreferences: config,
      });

      plan.taskId = session.taskId;

      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          plan: plan as any,
          totalSteps: plan.steps.length,
          status: 'RUNNING',
        },
      });

      this.wsGateway.emitToSession(sessionId, 'plan:created', { plan });

      // Step 2: Check policy
      const policyCheck = this.policyEngine.checkPlan(plan);
      if (!policyCheck.approved) {
        await this.prisma.executionSession.update({
          where: { id: sessionId },
          data: { status: 'FAILED', errorMessage: 'Plan blocked by policy engine' },
        });
        this.wsGateway.emitToSession(sessionId, 'execution:failed', {
          reason: 'policy',
          message: 'Plan violates safety policies',
          blockedSteps: policyCheck.blockedSteps,
        });
        return;
      }

      // Step 3: Create browser session
      await this.browserAgent.createSession(sessionId, config);
      this.wsGateway.emitToSession(sessionId, 'browser:initialized', {});

      // Step 4: Start screenshot streaming
      this.screenshotStreamer.startStreaming(sessionId, 500);

      // Step 5: Execute steps
      let completedSuccessfully = true;
      let failureReason: string | null = null;

      for (const step of plan.steps) {
        if (this.activeSessions.get(sessionId)?.aborting) {
          break;
        }

        try {
          const success = await this.executeStep(sessionId, step, plan);
          if (!success) {
            completedSuccessfully = false;
            failureReason = 'Step execution failed';

            // Attempt replan
            const beforeScreenshot = await this.browserAgent.takeScreenshot(sessionId);
            const couldReplan = await this.attemptReplan(
              sessionId,
              plan,
              step.index,
              failureReason,
              beforeScreenshot || undefined,
            );

            if (!couldReplan) {
              break;
            }
          }
        } catch (error: any) {
          completedSuccessfully = false;
          failureReason = error.message;
          break;
        }
      }

      // Step 6: Cleanup
      this.screenshotStreamer.stopStreaming(sessionId);
      await this.browserAgent.closeSession(sessionId);

      // Step 7: Store memories
      if (completedSuccessfully) {
        const planData = await this.prisma.executionSession.findUnique({
          where: { id: sessionId },
        });
        const stepsSummary = plan.steps.map((s) => `${s.action}(${s.target})`).join(' → ');
        await this.memory.store(
          session.userId,
          `Success: ${goal}`,
          MemoryType.EPISODIC,
          {
            taskId: session.taskId,
            summary: stepsSummary,
            metadata: {
              duration: Date.now() - session.createdAt.getTime(),
            },
          },
        );
      }

      // Step 8: Update final status
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          status: completedSuccessfully ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          errorMessage: failureReason,
        },
      });

      this.wsGateway.emitToSession(
        sessionId,
        'execution:completed',
        {
          status: completedSuccessfully ? 'success' : 'failed',
          reason: failureReason,
        },
      );

      this.activeSessions.delete(sessionId);
    } catch (error: any) {
      this.logger.error(`Execution failed: ${error.message}`);
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
      this.activeSessions.delete(sessionId);
    }
  }

  private async executeStep(
    sessionId: string,
    step: PlannedStep,
    plan: AgentPlan,
  ): Promise<boolean> {
    this.logger.log(`Executing step ${step.index}: ${step.description}`);

    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return false;

    // Policy check
    const policyCheck = this.policyEngine.checkStep(step);
    if (!policyCheck.allowed) {
      this.wsGateway.emitToSession(sessionId, 'step:blocked', {
        stepIndex: step.index,
        reason: policyCheck.reason,
      });
      return false;
    }

    // Emit step started
    this.wsGateway.emitToSession(sessionId, 'step:started', {
      stepIndex: step.index,
      description: step.description,
    });

    // Request approval if needed
    if (policyCheck.requiresApproval || step.requiresApproval) {
      const approved = await this.requestApproval(
        sessionId,
        step,
        policyCheck.riskLevel,
      );
      if (!approved) {
        this.wsGateway.emitToSession(sessionId, 'step:denied', {
          stepIndex: step.index,
        });
        return false;
      }
    }

    // Take before screenshot
    const beforeScreenshot = await this.screenshotStreamer.captureAndEmit(
      sessionId,
      step.index,
    );

    // Execute action
    const result = await this.browserAgent.executeAction(
      sessionId,
      step.action,
      step.target,
      step.value,
    );

    if (!result.success) {
      this.wsGateway.emitToSession(sessionId, 'step:failed', {
        stepIndex: step.index,
        error: result.error,
      });
      return false;
    }

    // Wait for condition if specified
    if (step.waitCondition) {
      await this.handleWaitCondition(sessionId, step.waitCondition);
    }

    // Take after screenshot for validation
    const afterScreenshot = await this.screenshotStreamer.captureAndEmit(
      sessionId,
      step.index,
    );

    // Vision validation
    const beforeAnalysis = await this.visionAgent.analyzeScreenshot(
      beforeScreenshot || '',
      { currentStep: step, goal: plan.goal },
    );

    const validation = beforeAnalysis ? await this.visionAgent.validateStepCompletion(
      beforeScreenshot || '',
      afterScreenshot || '',
      step,
    ) : null;

    if (validation && !validation.completed) {
      this.wsGateway.emitToSession(sessionId, 'step:validation_failed', {
        stepIndex: step.index,
        description: validation.description,
        confidence: validation.confidence,
      });

      if (step.fallback) {
        this.logger.log(`Attempting fallback for step ${step.index}`);
        const fallbackResult = await this.browserAgent.executeAction(
          sessionId,
          step.fallback.action,
          step.fallback.target,
          step.fallback.value,
        );
        if (!fallbackResult.success) {
          return false;
        }
      } else {
        return false;
      }
    }

    // Update session progress
    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { currentStepIndex: step.index + 1 },
    });

    this.wsGateway.emitToSession(sessionId, 'step:completed', {
      stepIndex: step.index,
      duration: step.index,
      validation: validation?.completed,
    });

    return true;
  }

  private async requestApproval(
    sessionId: string,
    step: PlannedStep,
    riskLevel: RiskLevel,
  ): Promise<boolean> {
    this.logger.log(`Requesting approval for step ${step.index}`);

    const approvalRequest = await this.prisma.approvalRequest.create({
      data: {
        sessionId,
        stepIndex: step.index,
        riskLevel,
        description: step.description,
        actionDetails: {
          action: step.action,
          target: step.target,
          value: step.value,
          description: step.description,
        } as any,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: 'WAITING_APPROVAL' },
    });

    this.wsGateway.emitToSession(sessionId, 'approval:requested', {
      approvalRequestId: approvalRequest.id,
      stepIndex: step.index,
      riskLevel,
      actionDetails: approvalRequest.actionDetails,
      expiresAt: approvalRequest.expiresAt,
    });

    // Set timeout for auto-deny
    const timeout = setTimeout(async () => {
      const req = await this.prisma.approvalRequest.findUnique({
        where: { id: approvalRequest.id },
      });
      if (req && req.status === 'PENDING') {
        await this.prisma.approvalRequest.update({
          where: { id: approvalRequest.id },
          data: { status: 'EXPIRED' },
        });
        this.wsGateway.emitToSession(sessionId, 'approval:expired', {
          approvalRequestId: approvalRequest.id,
        });
      }
    }, 5 * 60 * 1000);

    this.approvalTimeouts.set(approvalRequest.id, timeout);

    // Wait for approval (this will be handled by handleApprovalResponse)
    return new Promise<boolean>((resolve) => {
      this.eventEmitter.once(`approval:${approvalRequest.id}`, (approved) => {
        clearTimeout(timeout);
        this.approvalTimeouts.delete(approvalRequest.id);
        resolve(approved);
      });
    });
  }

  async handleApprovalResponse(
    approvalRequestId: string,
    status: 'APPROVED' | 'DENIED' | 'REJECTED',
  ): Promise<void> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
    });

    if (!approval || approval.status !== 'PENDING') {
      throw new Error('Invalid approval request');
    }

    const prismaStatus: ApprovalStatus =
      status === 'APPROVED' ? 'APPROVED' : 'REJECTED';

    await this.prisma.approvalRequest.update({
      where: { id: approvalRequestId },
      data: { status: prismaStatus },
    });

    const session = await this.prisma.executionSession.findUnique({
      where: { id: approval.sessionId },
    });

    if (session) {
      await this.prisma.executionSession.update({
        where: { id: session.id },
        data: { status: 'RUNNING' },
      });
    }

    const timeout = this.approvalTimeouts.get(approvalRequestId);
    if (timeout) {
      clearTimeout(timeout);
      this.approvalTimeouts.delete(approvalRequestId);
    }

    const approved = status === 'APPROVED';
    this.wsGateway.emitToSession(approval.sessionId, 'approval:responded', {
      approvalRequestId,
      status,
    });

    this.eventEmitter.emit(`approval:${approvalRequestId}`, approved);
  }

  private async attemptReplan(
    sessionId: string,
    originalPlan: AgentPlan,
    failedStepIndex: number,
    error: string,
    screenshot?: string,
  ): Promise<boolean> {
    this.logger.log(
      `Attempting replan from step ${failedStepIndex}`,
    );

    try {
      const screenshotAnalysis = screenshot
        ? await this.visionAgent.analyzeScreenshot(screenshot, {
            goal: originalPlan.goal,
          })
        : null;

      const newSteps = await this.plannerAgent.replanFromStep(
        originalPlan,
        failedStepIndex,
        error,
        screenshotAnalysis?.currentState,
      );

      const updatedPlan: AgentPlan = {
        ...originalPlan,
        steps: [
          ...originalPlan.steps.slice(0, failedStepIndex),
          ...newSteps,
        ],
      };

      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { plan: updatedPlan as any },
      });

      this.wsGateway.emitToSession(sessionId, 'plan:replanned', {
        fromStep: failedStepIndex,
        newStepCount: newSteps.length,
      });

      return true;
    } catch (error: any) {
      this.logger.error(`Replan failed: ${error.message}`);
      return false;
    }
  }

  private formatWaitCondition(condition: WaitCondition): string {
    switch (condition.type) {
      case 'timeout':
        return `time:${condition.value || condition.timeoutMs}`;
      case 'selector':
        return `selector:${condition.value}`;
      case 'text_visible':
        return `text:${condition.value}`;
      case 'navigation':
      case 'network_idle':
        return `time:${condition.timeoutMs}`;
      default:
        return `time:${condition.timeoutMs || 1000}`;
    }
  }

  private async handleWaitCondition(
    sessionId: string,
    condition: WaitCondition | string,
  ): Promise<void> {
    const encoded =
      typeof condition === 'string'
        ? condition
        : this.formatWaitCondition(condition);

    if (encoded.startsWith('time:')) {
      const ms = parseInt(encoded.substring(5), 10);
      await new Promise((res) => setTimeout(res, ms));
      return;
    }

    if (encoded.startsWith('selector:')) {
      const selector = encoded.substring(9);
      const session = this.browserAgent.getSession(sessionId);
      if (session) {
        try {
          await session.page.waitForSelector(selector, { timeout: 30000 });
        } catch {
          this.logger.warn(`Wait condition not met: ${encoded}`);
        }
      }
      return;
    }

    if (encoded.startsWith('text:')) {
      const text = encoded.substring(5);
      const session = this.browserAgent.getSession(sessionId);
      if (session) {
        try {
          await session.page.waitForFunction(
            (searchText) =>
              document.body.textContent?.includes(searchText),
            { timeout: 30000 },
            text,
          );
        } catch {
          this.logger.warn(`Wait condition not met: ${condition}`);
        }
      }
      return;
    }
  }

  async pauseExecution(sessionId: string): Promise<void> {
    this.logger.log(`Pausing execution: ${sessionId}`);
    this.screenshotStreamer.stopStreaming(sessionId);
    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: 'PAUSED' },
    });
    this.wsGateway.emitToSession(sessionId, 'execution:paused', {});
  }

  async resumeExecution(sessionId: string): Promise<void> {
    this.logger.log(`Resuming execution: ${sessionId}`);
    this.screenshotStreamer.startStreaming(sessionId, 500);
    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: 'RUNNING' },
    });
    this.wsGateway.emitToSession(sessionId, 'execution:resumed', {});
  }

  async cancelExecution(sessionId: string): Promise<void> {
    this.logger.log(`Cancelling execution: ${sessionId}`);

    const state = this.activeSessions.get(sessionId);
    if (state) {
      state.aborting = true;
    }

    this.screenshotStreamer.stopStreaming(sessionId);
    await this.browserAgent.closeSession(sessionId);

    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    this.wsGateway.emitToSession(sessionId, 'execution:cancelled', {});
    this.activeSessions.delete(sessionId);
  }

  getSession(sessionId: string) {
    return this.activeSessions.get(sessionId);
  }

  isActive(sessionId: string): boolean {
    const state = this.activeSessions.get(sessionId);
    return state ? !state.aborting : false;
  }
}
