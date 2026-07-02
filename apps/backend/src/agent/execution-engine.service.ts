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
import { ExecutionEventBus } from '../event-bus/execution-event-bus.service';
import {
  AgentPlan,
  PlannedStep,
  ExecutionEventType,
  BrowserSessionConfig,
  WaitCondition,
  CognitiveOutcomeType,
  CognitiveOutcome,
} from '../shared/interfaces/agent.interfaces';
import { ApprovalStatus, RiskLevel, MemoryType } from '@prisma/client';
import { ZomatoAdapter } from './domain-adapters/zomato-adapter.service';
import { SwiggyAdapter } from './domain-adapters/swiggy-adapter.service';
import { PlaywrightProvider } from './providers/playwright-provider.service';
import { ToolRouterService } from './tool-router.service';
import { VerifierAgentService, ExecutionSummary } from './verifier-agent.service';
import { StrategyMemoryService } from './strategy-memory.service';
import { GoalUnderstandingService, ParsedGoal } from './goal-understanding.service';
import { WorkerEventRelayService } from '../websocket/worker-event-relay.service';
import { ShadowModeService } from './shadow-mode.service';
// ─── Runtime Layer ────────────────────────────────────────────────────────────
import { SessionManagerService } from './runtime/session-manager.service';
import { ClarificationGateService } from './runtime/clarification-gate.service';
import { AutomationGateService } from './runtime/automation-gate.service';
import { WorkerDispatcherService } from './runtime/worker-dispatcher.service';
import { PlanOrchestratorService } from './runtime/plan-orchestrator.service';
// ─── Cognitive OS Runtime Services ──────────────────────────────────────────
import { WorldStateService } from './world-state.service';
import { DriftDetectorService } from './drift-detector.service';
import { ReflectionService } from './reflection.service';
import { ConfidenceNetworkService } from './confidence-network.service';
import { PreferenceMemoryService } from '../memory/preferences/preference-memory.service';
// ─── Phase 2: Pipeline Stage Classes ────────────────────────────────────────
import { ExecutionPipelineService } from './stages/execution-pipeline.service';

@Injectable()
export class ExecutionEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(ExecutionEngineService.name);
  private approvalTimeouts = new Map<string, NodeJS.Timeout>();
  /** sessionId → pending launch-gate approvalRequestId (one per session). */
  private pendingLaunchApprovals = new Map<string, string>();
  /** In-process user-data channel: sessionId → injected data (OTP, credential, etc.).
   *  Never exposed over WebSocket; consumed by the execution loop via EventEmitter2. */
  private injectedUserData = new Map<string, unknown>();

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => BrowserAgentService))
    private browserAgent: BrowserAgentService,
    private plannerAgent: PlannerAgentService,
    private visionAgent: VisionAgentService,
    private policyEngine: PolicyEngineService,
    @Inject(forwardRef(() => ScreenshotStreamerService))
    private screenshotStreamer: ScreenshotStreamerService,
    private memory: MemoryService,
    private eventBus: ExecutionEventBus,
    private eventEmitter: EventEmitter2,
    private toolRouter: ToolRouterService,
    private verifierAgent: VerifierAgentService,
    private strategyMemory: StrategyMemoryService,
    private goalUnderstanding: GoalUnderstandingService,
    @Inject(forwardRef(() => WorkerEventRelayService))
    private workerRelay: WorkerEventRelayService,
    @Inject(forwardRef(() => SessionManagerService))
    private sessionManager: SessionManagerService,
    private clarificationGate: ClarificationGateService,
    private automationGate: AutomationGateService,
    private workerDispatcher: WorkerDispatcherService,
    private planOrchestrator: PlanOrchestratorService,
    // ─── Cognitive OS Runtime ───────────────────────────────────────────
    private worldState: WorldStateService,
    private driftDetector: DriftDetectorService,
    private reflection: ReflectionService,
    private cpn: ConfidenceNetworkService,
    private preferenceMemory: PreferenceMemoryService,
    // ─── Shadow / Simulation ─────────────────────────────────────────
    private shadowMode: ShadowModeService,
    // ─── Phase 2: Pipeline Stage Classes ─────────────────────────────
    private readonly pipeline: ExecutionPipelineService,
  ) {}

  /**
   * Delivers sensitive user input (OTP, credential, etc.) to the execution loop
   * through an in-process channel only — the data is never transmitted over
   * WebSocket. The data is stored in `injectedUserData` and the EventEmitter fires
   * a signal so any waiting execution step can consume it without polling.
   */
  injectUserData(sessionId: string, data: unknown): void {
    this.injectedUserData.set(sessionId, data);
    this.eventEmitter.emit(`user:data:${sessionId}`, data);
  }

  /**
   * Retrieves and clears injected user data for a session.
   * Returns undefined if no data was injected.
   */
  consumeInjectedUserData(sessionId: string): unknown {
    const data = this.injectedUserData.get(sessionId);
    this.injectedUserData.delete(sessionId);
    return data;
  }

  async onModuleDestroy() {
    for (const sessionId of this.sessionManager.allSessionIds()) {
      await this.cancelExecution(sessionId);
    }
  }

  // ─── Main Execution Flow ────────────────────────────────

  async startExecution(
    userId: string,
    taskId: string,
    goal: string,
    config?: Partial<BrowserSessionConfig>,
    parsedGoal?: ParsedGoal,
  ): Promise<string> {
    const sessionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const profile = (config as any)?.profile ?? 'balanced';

    this.logger.log(`Starting execution: ${sessionId} | profile=${profile} | goal: "${goal}"`);

    await this.prisma.executionSession.create({
      data: {
        id: sessionId,
        taskId,
        userId,
        status: 'PLANNING',
        metadata: { goal, profile, parsedGoal: parsedGoal || null } as any,
        currentStepIndex: 0,
      },
    });

    // ── Initialize COS runtime for this session ──────────────────────────────────
    this.worldState.initializeSession(sessionId);
    await this.driftDetector.initializeGoal(sessionId, goal);
    this.cpn.initializeSession(sessionId);
    // Seed planner confidence from goal clarity (assume healthy at start)
    this.cpn.recordConfidence(sessionId, 'planner', 0.90, 1.2, 0.002);

    this.sessionManager.create(sessionId, profile, parsedGoal);

    this.eventBus.emit(sessionId, 'session:started', { sessionId, profile });

    // Emit initial WSO state
    const initialWso = this.worldState.getState(sessionId);
    if (initialWso) {
      this.eventBus.emit(sessionId, 'cos:world_state', {
        stateConfidence: initialWso.stateConfidence,
        beliefSourceConsensus: initialWso.beliefSourceConsensus,
        version: initialWso.version,
        belief: Object.fromEntries(
          Object.entries(initialWso.belief).map(([k, v]) => [k, { value: v.value, confidence: v.sourceConfidence, source: v.source }])
        ),
      });
    }

    if (parsedGoal && this.clarificationGate.needsClarification(parsedGoal)) {
      setImmediate(async () => {
        const result = await this.clarificationGate.runGate(sessionId, parsedGoal, goal);
        if (!result) {
          this.sessionManager.delete(sessionId);
          return;
        }
        const state = this.sessionManager.get(sessionId);
        if (state) state.parsedGoal = result.refinedGoal;
        await this.runExecution(sessionId, result.goalText, config, result.refinedGoal);
      });
      return sessionId;
    }

    setImmediate(() => this.runExecution(sessionId, goal, config, parsedGoal));

    return sessionId;
  }

  private async runExecution(
    sessionId: string,
    goal: string,
    config?: Partial<BrowserSessionConfig>,
    parsedGoal?: ParsedGoal,
  ): Promise<void> {
    await this.pipeline.run(sessionId, goal, config, parsedGoal);
  }

  private async executeStep(
    sessionId: string,
    step: PlannedStep,
    plan: AgentPlan,
  ): Promise<{ success: boolean; error?: string; data?: any }> {
    this.logger.log(`Executing step ${step.index}: ${step.description}`);

    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return { success: false, error: 'Session not found' };

    // Policy check
    const policyCheck = this.policyEngine.checkStep(step);
    if (!policyCheck.allowed) {
      this.eventBus.emit(sessionId, 'step:blocked', {
        stepIndex: step.index,
        reason: policyCheck.reason,
      });
      return { success: false, error: `Policy blocked: ${policyCheck.reason}` };
    }

    // Emit step started
    this.eventBus.emit(sessionId, 'step:started', {
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
        this.eventBus.emit(sessionId, 'step:denied', {
          stepIndex: step.index,
        });
        return { success: false, error: 'Approval denied by user' };
      }
    }

    // Take before screenshot
    const beforeScreenshot = await this.screenshotStreamer.captureAndEmit(
      sessionId,
      step.index,
    );

    // ── Execute via ToolRouter (decoupled agent arbitration) ─────────────
    const toolResult = await this.toolRouter.execute(sessionId, step);
    const result = {
      success: toolResult.success,
      screenshot: toolResult.screenshot,
      error: toolResult.error,
      data: toolResult.data,
    };

    if (!result.success) {
      this.eventBus.emit(sessionId, 'step:failed', {
        stepIndex: step.index,
        error: result.error,
      });
      return { success: false, error: result.error };
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
    const beforeAnalysis = beforeScreenshot ? await this.visionAgent.analyzeScreenshot(
      beforeScreenshot,
      { currentStep: step, goal: plan.goal },
    ) : null;

    const validation = beforeAnalysis && beforeScreenshot && afterScreenshot ? await this.visionAgent.validateStepCompletion(
      beforeScreenshot,
      afterScreenshot,
      step,
    ) : null;

    if (validation && !validation.completed) {
      this.eventBus.emit(sessionId, 'step:validation_failed', {
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
          return { success: false, error: 'Fallback action also failed' };
        }
      } else {
        return { success: false, error: `Validation failed: ${validation.description}` };
      }
    }

    // ── COS: Update WSO belief state from DOM sensor results ─────────────
    const loginStatus = await this.browserAgent.executeSkill(sessionId, 'detect_login', {});
    const paymentStatus = await this.browserAgent.executeSkill(sessionId, 'detect_payment', {});
    const otpStatus = await this.browserAgent.executeSkill(sessionId, 'detect_otp', {});
    const captchaStatus = await this.browserAgent.executeSkill(sessionId, 'detect_captcha', {});

    const isLogin = loginStatus.success && (loginStatus.data?.detected || loginStatus.data?.isLoginRequired);
    const isPayment = paymentStatus.success && (paymentStatus.data?.detected || paymentStatus.data?.isPaymentDetected);
    const isOtp = otpStatus.success && (otpStatus.data?.detected || otpStatus.data?.isOtpDetected);
    const isCaptcha = captchaStatus.success && (captchaStatus.data?.detected || captchaStatus.data?.isCaptchaDetected);

    // Feed DOM sensor readings into World State Object
    if (isLogin) {
      this.worldState.updateBelief(sessionId, 'authStatus', 'logging_in', 'DOM_DIRECT', 0.92);
      this.worldState.updateBelief(sessionId, 'isFormPresent', true, 'DOM_DIRECT', 0.95);
      this.worldState.updateBelief(sessionId, 'activeStage', 'navigation', 'DOM_DIRECT', 0.80);
    }
    if (isPayment) {
      this.worldState.updateBelief(sessionId, 'isCheckoutDetect', true, 'DOM_DIRECT', 0.96);
      this.worldState.updateBelief(sessionId, 'activeStage', 'transaction', 'DOM_DIRECT', 0.92);
      this.worldState.updateBelief(sessionId, 'hostilityIndex', 0.7, 'DOM_DIRECT', 0.85);
    }
    if (isOtp || isCaptcha) {
      this.worldState.updateBelief(sessionId, 'hostilityIndex', 0.85, 'DOM_DIRECT', 0.9);
      this.worldState.updateBelief(sessionId, 'isModalActive', true, 'DOM_DIRECT', 0.88);
    }

    // Vision-layer WSO update if afterScreenshot exists
    if (afterScreenshot && validation) {
      const visionConfidence = validation.confidence ?? 0.5;
      this.worldState.updateBelief(sessionId, 'pageVolatility',
        validation.completed ? 0.1 : 0.7,
        'VISION_INFERRED',
        visionConfidence,
      );
    }

    // Post-Step Blocker check & Safety Pause
    let isBlockerDetected = false;
    let blockerReason = '';
    let blockerType: 'WAITING_APPROVAL' | 'WAITING_OTP' = 'WAITING_APPROVAL';

    if (isLogin) {
      isBlockerDetected = true;
      blockerReason = `Login form detected: ${loginStatus.data?.reasons?.join(', ') || 'login wall'}`;
      blockerType = 'WAITING_APPROVAL';
    } else if (isPayment) {
      isBlockerDetected = true;
      blockerReason = `Payment or checkout flow detected: ${paymentStatus.data?.reasons?.join(', ') || 'payment gate'}`;
      blockerType = 'WAITING_APPROVAL';
    } else if (isOtp) {
      isBlockerDetected = true;
      blockerReason = `One-time password or SMS verification code detected: ${otpStatus.data?.reasons?.join(', ') || 'OTP prompt'}`;
      blockerType = 'WAITING_OTP';
    } else if (isCaptcha) {
      isBlockerDetected = true;
      blockerReason = `CAPTCHA verification detected: ${captchaStatus.data?.reasons?.join(', ') || 'captcha challenge'}`;
      blockerType = 'WAITING_APPROVAL';
    }

    // Vision Blocker checks
    if (!isBlockerDetected && afterScreenshot) {
      const visionBlocker = await this.visionAgent.detectBlockers(afterScreenshot);
      if (visionBlocker.hasBlocker) {
        isBlockerDetected = true;
        blockerReason = visionBlocker.description || `Page blocker detected: ${visionBlocker.blockerType}`;
        if (visionBlocker.blockerType === 'captcha') {
          blockerReason = `CAPTCHA verification detected. Please solve the CAPTCHA in the browser window.`;
        }
        blockerType = 'WAITING_APPROVAL';
        // Vision confirms hostility
        this.worldState.updateBelief(sessionId, 'hostilityIndex', 0.9, 'VISION_INFERRED', 0.85);
      }
    }

    // Validation confidence check
    if (validation && validation.confidence < 0.8) {
      isBlockerDetected = true;
      blockerReason = `Validation confidence is low (${validation.confidence}). Please verify the page state.`;
      blockerType = 'WAITING_APPROVAL';
    }

    // Trigger safety auto-pause if a blocker is found!
    if (isBlockerDetected) {
      this.logger.warn(`Safety Interception Activated! Reason: ${blockerReason}`);
      
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:warn',
        data: { source: 'SafetyEngine', message: `Safety Auto-Pause: ${blockerReason}` }
      });

      const mockStep = {
        ...step,
        description: `Safety Block: ${blockerReason}`,
        requiresApproval: true,
      };

      const userRiskLevel = blockerReason.toLowerCase().includes('payment') ? 'CRITICAL' : 'HIGH';
      
      this.logger.log(`State Transition for session ${sessionId}: [RUNNING] ──> [${blockerType}]`);
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'execution_state_changed',
        data: { sessionId, oldState: 'executing', newState: blockerType.toLowerCase() }
      });

      const approved = await this.requestApproval(
        sessionId,
        mockStep,
        userRiskLevel,
      );

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

    // Get current WSO confidence for frontend
    const wso = this.worldState.getState(sessionId);

    this.eventBus.emit(sessionId, 'step:completed', {
      stepIndex: step.index,
      duration: step.index,
      validation: validation?.completed,
      confidence: wso?.stateConfidence ?? 1.0,
    });

    return { success: true, data: result.data };
  }

  /**
   * Pre-launch gate approval. Reuses the per-step approval plumbing
   * (ApprovalRequest + `approval:requested` + handleApprovalResponse) but with
   * a synthetic step index of -1 and a `gate` flag, so the UI can label it
   * "Approve & Launch" rather than an in-flight step verification.
   *
   * Resolves true → user approved the launch; false → denied or expired. The
   * browser is NOT opened until this resolves true.
   */
  private async requestLaunchApproval(
    sessionId: string,
    plan: AgentPlan,
    gate: { riskLevel: RiskLevel; reason: string; targetDomains: string[] },
  ): Promise<boolean> {
    this.logger.log(`Requesting LAUNCH approval for session ${sessionId}`);

    const description =
      `Launch browser & run ${plan.steps.length} step(s)` +
      (gate.targetDomains.length ? ` on ${gate.targetDomains.join(', ')}` : '');

    const approvalRequest = await this.prisma.approvalRequest.create({
      data: {
        sessionId,
        stepIndex: -1,
        riskLevel: gate.riskLevel,
        description,
        actionDetails: {
          action: 'launch_browser',
          target: gate.targetDomains.join(', ') || undefined,
          description,
          gate: true,
          reason: gate.reason,
          targetDomains: gate.targetDomains,
          totalSteps: plan.steps.length,
        } as any,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // Gate owns this — derived execution state becomes WAITING_APPROVAL.
    this.sessionManager.setGateState(sessionId, 'WAITING_APPROVAL');

    this.eventBus.emit(sessionId, 'approval:requested', {
      approvalRequestId: approvalRequest.id,
      stepIndex: -1,
      gate: true,
      riskLevel: gate.riskLevel,
      reason: gate.reason,
      targetDomains: gate.targetDomains,
      actionDetails: approvalRequest.actionDetails,
      expiresAt: approvalRequest.expiresAt,
    });

    const timeout = setTimeout(async () => {
      const req = await this.prisma.approvalRequest.findUnique({
        where: { id: approvalRequest.id },
      });
      if (req && req.status === 'PENDING') {
        await this.prisma.approvalRequest.update({
          where: { id: approvalRequest.id },
          data: { status: 'EXPIRED' },
        });
        this.eventBus.emit(sessionId, 'approval:expired', {
          approvalRequestId: approvalRequest.id,
        });
        // Treat an expired launch gate as a denial.
        this.eventEmitter.emit(`approval:${approvalRequest.id}`, false);
      }
    }, 5 * 60 * 1000);

    this.approvalTimeouts.set(approvalRequest.id, timeout);
    this.pendingLaunchApprovals.set(sessionId, approvalRequest.id);

    return new Promise<boolean>((resolve) => {
      this.eventEmitter.once(`approval:${approvalRequest.id}`, (approved) => {
        clearTimeout(timeout);
        this.approvalTimeouts.delete(approvalRequest.id);
        this.pendingLaunchApprovals.delete(sessionId);
        resolve(approved);
      });
    });
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

    // Gate owns this — mid-run, browserState stays RUNNING but the derived
    // execution state surfaces WAITING_APPROVAL until the user responds.
    this.sessionManager.setGateState(sessionId, 'WAITING_APPROVAL');

    this.eventBus.emit(sessionId, 'approval:requested', {
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
        this.eventBus.emit(sessionId, 'approval:expired', {
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

    // Clear the gate. Execution state is DERIVED: if a live browser exists it
    // resolves to RUNNING; pre-launch it stays in the PLANNING family. We never
    // write RUNNING directly here — that would be the orchestrator lying.
    this.sessionManager.setGateState(approval.sessionId, 'CLEARED');

    const timeout = this.approvalTimeouts.get(approvalRequestId);
    if (timeout) {
      clearTimeout(timeout);
      this.approvalTimeouts.delete(approvalRequestId);
    }

    const approved = status === 'APPROVED';
    this.eventBus.emit(approval.sessionId, 'approval:responded', {
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
      const session = await this.prisma.executionSession.findUnique({
        where: { id: sessionId },
      });

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
        { userId: session?.userId },
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

      this.eventBus.emit(sessionId, 'plan:replanned', {
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
            text,
            { timeout: 30000 },
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
    
    this.logger.log(`State Transition for session ${sessionId}: [RUNNING] ──> [PAUSED]`);
    this.eventBus.emit(sessionId, 'execution:event', {
      type: 'execution_state_changed',
      data: { sessionId, oldState: 'executing', newState: 'paused' }
    });

    this.screenshotStreamer.stopStreaming(sessionId);
    // PAUSED is a runtime state; the authority's recompute persists it.
    this.sessionManager.transitionBrowserState(sessionId, 'PAUSED');
    this.eventBus.emit(sessionId, 'execution:paused', {});
  }

  async resumeExecution(sessionId: string): Promise<void> {
    this.logger.log(`Resuming execution: ${sessionId}`);

    this.logger.log(`State Transition for session ${sessionId}: [PAUSED] ──> [RUNNING]`);
    this.eventBus.emit(sessionId, 'execution:event', {
      type: 'execution_state_changed',
      data: { sessionId, oldState: 'paused', newState: 'executing' }
    });

    this.screenshotStreamer.startStreaming(sessionId, 500);
    // Resuming a confirmed-alive browser (PAUSED → RUNNING) is not fabrication —
    // the browser already exists. The authority's recompute persists RUNNING.
    this.sessionManager.transitionBrowserState(sessionId, 'RUNNING');
    this.eventBus.emit(sessionId, 'execution:resumed', {});
  }

  async cancelExecution(sessionId: string): Promise<void> {
    this.logger.log(`Cancelling execution: ${sessionId}`);

    const state = this.sessionManager.get(sessionId);
    if (state) {
      state.aborting = true;
    }

    this.logger.log(`State Transition for session ${sessionId}: [RUNNING/PAUSED] ──> [CANCELLED]`);
    this.eventBus.emit(sessionId, 'execution:event', {
      type: 'execution_state_changed',
      data: { sessionId, oldState: 'executing', newState: 'failed' }
    });

    this.screenshotStreamer.stopStreaming(sessionId);
    await this.browserAgent.closeSession(sessionId);
    this.sessionManager.transitionBrowserState(sessionId, 'STOPPED');

    // If THIS session's launch gate is still waiting, release it as a denial so
    // the awaited runExecution promise unblocks and never opens a browser.
    const pendingLaunchId = this.pendingLaunchApprovals.get(sessionId);
    if (pendingLaunchId) {
      this.eventEmitter.emit(`approval:${pendingLaunchId}`, false);
    }

    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    this.eventBus.emit(sessionId, 'execution:cancelled', {});
    this.sessionManager.delete(sessionId);
  }

  getSession(sessionId: string) {
    return this.sessionManager.get(sessionId);
  }

  isActive(sessionId: string): boolean {
    const state = this.sessionManager.get(sessionId);
    return state ? !state.aborting : false;
  }
}
