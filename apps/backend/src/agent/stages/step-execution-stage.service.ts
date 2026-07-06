<<<<<<< HEAD
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
=======
import { Injectable, Logger } from '@nestjs/common';
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BrowserAgentService } from '../browser-agent.service';
import { ScreenshotStreamerService } from '../screenshot-streamer.service';
import { ToolRouterService } from '../tool-router.service';
import { VisionAgentService } from '../vision-agent.service';
import { PolicyEngineService } from '../policy-engine.service';
import { PlannerAgentService } from '../planner-agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionManagerService } from '../runtime/session-manager.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { CognitiveCircuitBreaker } from './circuit-breaker.service';
import { WorldStateSensor } from './world-state-sensor.service';
import { ExecutionContext } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';
import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';

@Injectable()
export class StepExecutionStage implements IExecutionStage {
  private readonly logger = new Logger(StepExecutionStage.name);
  private approvalTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
<<<<<<< HEAD
    @Inject(forwardRef(() => BrowserAgentService))
    private readonly browserAgent: BrowserAgentService,
    @Inject(forwardRef(() => ScreenshotStreamerService))
=======
    private readonly browserAgent: BrowserAgentService,
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
    private readonly screenshotStreamer: ScreenshotStreamerService,
    private readonly toolRouter: ToolRouterService,
    private readonly visionAgent: VisionAgentService,
    private readonly policyEngine: PolicyEngineService,
    private readonly plannerAgent: PlannerAgentService,
    private readonly prisma: PrismaService,
<<<<<<< HEAD
    @Inject(forwardRef(() => SessionManagerService))
=======
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
    private readonly sessionManager: SessionManagerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: ExecutionEventBus,
    private readonly circuitBreaker: CognitiveCircuitBreaker,
    private readonly worldStateSensor: WorldStateSensor,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    const { sessionId } = ctx;
    if (!ctx.plan) return;

    // Step 3: Create browser session
    await this.browserAgent.createSession(sessionId, ctx.config);
    this.eventBus.emit(sessionId, 'browser:initialized', {});

    // Step 4: Start screenshot streaming
    this.screenshotStreamer.startStreaming(sessionId, 500);

    // ── Step 5: Execute steps ──
    const plan = ctx.plan;
    let sessionState = this.sessionManager.get(sessionId);
    if (sessionState) {
      sessionState.matchedPluginIds = (plan as any).matchedSkills || [];
      sessionState.routedDomain = ctx.routedDomain;
    }

    for (const step of plan.steps) {
      if (this.sessionManager.get(sessionId)?.aborting) break;

      // ── CognitiveCircuitBreaker pre-step ──
      const gateResult = await this.circuitBreaker.preStep(ctx, step, plan);
      if (gateResult.shouldAbort) break;
      if (gateResult.shouldPause && !gateResult.pauseResolved) break;

      // Emit tool routing decision
      const routeDesc = this.toolRouter.describeRoute(step);
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:info',
        data: { source: 'ToolRouter', message: `Step[${step.index}] → ${routeDesc}` },
      });

      try {
        const stepResult = await this.executeStep(sessionId, step, plan);
        if (sessionState) sessionState.stepResults.push(stepResult);

        if (stepResult.success) {
          ctx.stepsCompleted++;
          await this.circuitBreaker.recordStep(ctx, step, stepResult);
        } else {
          ctx.stepsFailed++;
          ctx.completedSuccessfully = false;
          ctx.failureReason = 'Step execution failed';
          ctx.errorHistory.push(`Step ${step.index}: ${step.description} — failed`);

          const beforeScreenshot = await this.browserAgent.takeScreenshot(sessionId);
          const couldReplan = await this.attemptReplan(sessionId, plan, step.index, ctx.failureReason, beforeScreenshot || undefined);
          if (!couldReplan) break;
        }
      } catch (error: any) {
        ctx.stepsFailed++;
        ctx.completedSuccessfully = false;
        ctx.failureReason = error.message;
        ctx.errorHistory.push(`Step ${step.index}: ${error.message}`);
        break;
      }
    }

    // Cleanup browser + streaming (but NOT CPN — ReflectionStage handles final CPN)
    this.screenshotStreamer.stopStreaming(sessionId);
    await this.browserAgent.closeSession(sessionId);
  }

  private async executeStep(
    sessionId: string,
    step: PlannedStep,
    plan: AgentPlan,
  ): Promise<{ success: boolean; error?: string; data?: any }> {
    this.logger.log(`Executing step ${step.index}: ${step.description}`);

    const session = await this.prisma.executionSession.findUnique({ where: { id: sessionId } });
    if (!session) return { success: false, error: 'Session not found' };

    const policyCheck = this.policyEngine.checkStep(step);
    if (!policyCheck.allowed) {
      this.eventBus.emit(sessionId, 'step:blocked', { stepIndex: step.index, reason: policyCheck.reason });
      return { success: false, error: `Policy blocked: ${policyCheck.reason}` };
    }

    this.eventBus.emit(sessionId, 'step:started', { stepIndex: step.index, description: step.description });

    if (policyCheck.requiresApproval || step.requiresApproval) {
      const approved = await this.requestApproval(sessionId, step, policyCheck.riskLevel);
      if (!approved) {
        this.eventBus.emit(sessionId, 'step:denied', { stepIndex: step.index });
        return { success: false, error: 'Approval denied by user' };
      }
    }

    const beforeScreenshot = await this.screenshotStreamer.captureAndEmit(sessionId, step.index);
    const toolResult = await this.toolRouter.execute(sessionId, step);
    const result = { success: toolResult.success, screenshot: toolResult.screenshot, error: toolResult.error, data: toolResult.data };

    if (!result.success) {
      this.eventBus.emit(sessionId, 'step:failed', { stepIndex: step.index, error: result.error });
      return { success: false, error: result.error };
    }

    if (step.waitCondition) {
      await this.handleWaitCondition(sessionId, step.waitCondition);
    }

    const afterScreenshot = await this.screenshotStreamer.captureAndEmit(sessionId, step.index);

    const beforeAnalysis = beforeScreenshot
      ? await this.visionAgent.analyzeScreenshot(beforeScreenshot, { currentStep: step, goal: plan.goal })
      : null;

    const validation = beforeAnalysis && beforeScreenshot && afterScreenshot
      ? await this.visionAgent.validateStepCompletion(beforeScreenshot, afterScreenshot, step)
      : null;

    if (validation && !validation.completed) {
      this.eventBus.emit(sessionId, 'step:validation_failed', {
        stepIndex: step.index, description: validation.description, confidence: validation.confidence,
      });

      if (step.fallback) {
        this.logger.log(`Attempting fallback for step ${step.index}`);
        const fallbackResult = await this.browserAgent.executeAction(sessionId, step.fallback.action, step.fallback.target, step.fallback.value);
        if (!fallbackResult.success) return { success: false, error: 'Fallback action also failed' };
      } else {
        return { success: false, error: `Validation failed: ${validation.description}` };
      }
    }

    // ── DOM Sensor readings ──
    const loginStatus = await this.browserAgent.executeSkill(sessionId, 'detect_login', {});
    const paymentStatus = await this.browserAgent.executeSkill(sessionId, 'detect_payment', {});
    const otpStatus = await this.browserAgent.executeSkill(sessionId, 'detect_otp', {});
    const captchaStatus = await this.browserAgent.executeSkill(sessionId, 'detect_captcha', {});

    const isLogin = loginStatus.success && (loginStatus.data?.detected || loginStatus.data?.isLoginRequired);
    const isPayment = paymentStatus.success && (paymentStatus.data?.detected || paymentStatus.data?.isPaymentDetected);
    const isOtp = otpStatus.success && (otpStatus.data?.detected || otpStatus.data?.isOtpDetected);
    const isCaptcha = captchaStatus.success && (captchaStatus.data?.detected || captchaStatus.data?.isCaptchaDetected);

    // ── WorldStateSensor: post-step WSO update ──
    await this.worldStateSensor.postStep(
      { sessionId } as ExecutionContext,
      step,
      isLogin, isPayment, isOtp, isCaptcha,
      afterScreenshot,
      validation?.completed ?? null,
      validation?.confidence ?? null,
    );

    // ── Safety auto-pause (blocker detection) ──
    const visionBlocker = afterScreenshot ? await this.visionAgent.detectBlockers(afterScreenshot) : null;
    const blocker = this.worldStateSensor.detectBlockers(
      isLogin, isPayment, isOtp, isCaptcha,
      loginStatus.data, otpStatus.data, captchaStatus.data, paymentStatus.data,
      visionBlocker, validation?.confidence ?? null,
    );

    if (blocker) {
      this.logger.warn(`Safety Interception Activated! Reason: ${blocker.blockerReason}`);
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:warn',
        data: { source: 'SafetyEngine', message: `Safety Auto-Pause: ${blocker.blockerReason}` },
      });

      const mockStep = { ...step, description: `Safety Block: ${blocker.blockerReason}`, requiresApproval: true };
      const userRiskLevel = blocker.blockerReason.toLowerCase().includes('payment') ? 'CRITICAL' : 'HIGH';

      this.logger.log(`State Transition for session ${sessionId}: [RUNNING] ──> [${blocker.blockerType}]`);
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'execution_state_changed',
        data: { sessionId, oldState: 'executing', newState: blocker.blockerType.toLowerCase() },
      });

      const approved = await this.requestApproval(sessionId, mockStep, userRiskLevel);
      if (!approved) {
        this.eventBus.emit(sessionId, 'step:denied', { stepIndex: step.index });
        return { success: false, error: 'User denied safety block' };
      }
    }

    // Update session progress
    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { currentStepIndex: step.index + 1 },
    });

    const wso = null; // WSO state already emitted via postStep
    this.eventBus.emit(sessionId, 'step:completed', {
      stepIndex: step.index,
      duration: step.index,
      validation: validation?.completed,
      confidence: 1.0,
    });

    return { success: true, data: result.data };
  }

  private async requestApproval(
    sessionId: string,
    step: PlannedStep,
    riskLevel: string,
  ): Promise<boolean> {
    const approvalRequest = await this.prisma.approvalRequest.create({
      data: {
        sessionId,
        stepIndex: step.index,
        riskLevel: riskLevel as any,
        description: step.description,
        actionDetails: { action: step.action, target: step.target, value: step.value, description: step.description } as any,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    this.sessionManager.setGateState(sessionId, 'WAITING_APPROVAL');

    this.eventBus.emit(sessionId, 'approval:requested', {
      approvalRequestId: approvalRequest.id,
      stepIndex: step.index,
      riskLevel,
      actionDetails: approvalRequest.actionDetails,
      expiresAt: approvalRequest.expiresAt,
    });

    const timeout = setTimeout(async () => {
      const req = await this.prisma.approvalRequest.findUnique({ where: { id: approvalRequest.id } });
      if (req && req.status === 'PENDING') {
        await this.prisma.approvalRequest.update({ where: { id: approvalRequest.id }, data: { status: 'EXPIRED' } });
        this.eventBus.emit(sessionId, 'approval:expired', { approvalRequestId: approvalRequest.id });
      }
    }, 5 * 60 * 1000);

    this.approvalTimeouts.set(approvalRequest.id, timeout);

    return new Promise<boolean>((resolve) => {
      this.eventEmitter.once(`approval:${approvalRequest.id}`, (approved) => {
        clearTimeout(timeout);
        this.approvalTimeouts.delete(approvalRequest.id);
        resolve(approved);
      });
    });
  }

  private async attemptReplan(
    sessionId: string,
    originalPlan: AgentPlan,
    failedStepIndex: number,
    error: string,
    screenshot?: string,
  ): Promise<boolean> {
    this.logger.log(`Attempting replan from step ${failedStepIndex}`);
    try {
      const session = await this.prisma.executionSession.findUnique({ where: { id: sessionId } });
      const screenshotAnalysis = screenshot
        ? await this.visionAgent.analyzeScreenshot(screenshot, { goal: originalPlan.goal })
        : null;

      const newSteps = await this.plannerAgent.replanFromStep(
        originalPlan, failedStepIndex, error,
        screenshotAnalysis?.currentState, { userId: session?.userId },
      );

      const updatedPlan: AgentPlan = {
        ...originalPlan,
        steps: [...originalPlan.steps.slice(0, failedStepIndex), ...newSteps],
      };

      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { plan: updatedPlan as any, totalSteps: updatedPlan.steps.length },
      });

      this.eventBus.emit(sessionId, 'plan:replanned', { fromStep: failedStepIndex, newStepCount: newSteps.length });
      return true;
    } catch (err: any) {
      this.logger.error(`Replan failed: ${err.message}`);
      return false;
    }
  }

  private async handleWaitCondition(
    sessionId: string,
    condition: { type: string; value: string; timeoutMs: number },
  ): Promise<void> {
    if (condition.type === 'selector') {
      const page = this.browserAgent.getSession(sessionId);
      if (page) {
        try {
          await (page as any).waitForSelector(condition.value, { timeout: condition.timeoutMs });
        } catch { /* timeout is acceptable */ }
      }
    }
  }
}
