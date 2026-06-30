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
    @Inject(forwardRef(() => AgentGateway))
    private wsGateway: AgentGateway,
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

    this.wsGateway.emitToSession(sessionId, 'session:started', { sessionId, profile });

    // Emit initial WSO state
    const initialWso = this.worldState.getState(sessionId);
    if (initialWso) {
      this.wsGateway.emitToSession(sessionId, 'cos:world_state', {
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
    const executionStart = Date.now();
    let session: any = null;
    try {
      session = await this.prisma.executionSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        this.logger.error(`Session not found: ${sessionId}`);
        return;
      }

      const routed = await this.planOrchestrator.buildExecutionPlan(
        sessionId,
        session.userId,
        session.taskId,
        goal,
        parsedGoal,
        config,
      );
      const plan = routed.merged.plan;
      const executionGraph = routed.merged.graph;

      // Persist the plan. Status stays in the PLANNING family — the orchestrator
      // NEVER writes RUNNING (RUNNING is derived from a live browser). The gate
      // moves to PLAN_READY: plan built, policy-checked, no browser yet.
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          plan: plan as any,
          totalSteps: plan.steps.length,
          metadata: {
            ...((session.metadata as Record<string, any>) || {}),
            parsedGoal: parsedGoal || null,
            routedDomain: routed.domain,
            matchedSkills: routed.matchedSkills,
            preferredSitesApplied: routed.preferredSitesApplied || [],
          } as any,
        },
      });

      this.wsGateway.emitToSession(sessionId, 'plan:created', { plan });
      this.sessionManager.setGateState(sessionId, 'PLAN_READY');

      // Step 2: Check policy
      const policyCheck = this.policyEngine.checkPlan(plan);
      if (!policyCheck.approved) {
        this.logger.log(`State Transition for session ${sessionId}: [RUNNING] ──> [FAILED] (Policy Blocked)`);
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'execution_state_changed',
          data: { sessionId, oldState: 'executing', newState: 'failed' }
        });

        const firstBlocked = policyCheck.stepChecks.find((sc) => !sc.check.allowed);
        const policyReason = firstBlocked?.check.reason || 'Plan violates safety policies';
        const earlyOutcome: CognitiveOutcome = {
          type: CognitiveOutcomeType.SAFE_ABORT,
          explanation: `Safety policy block: ${policyReason}`,
          confidence: 1.0,
          timestamp: Date.now(),
        };

        await this.prisma.executionSession.update({
          where: { id: sessionId },
          data: {
            status: 'FAILED',
            errorMessage: 'Plan blocked by policy engine',
            metadata: {
              cognitiveOutcome: earlyOutcome as any,
            } as any
          },
        });
        this.wsGateway.emitToSession(sessionId, 'execution:failed', {
          reason: 'policy',
          message: 'Plan violates safety policies',
          blockedSteps: policyCheck.blockedSteps,
          cognitiveOutcome: earlyOutcome,
        });
        return;
      }

      // ── AUTOMATION GATE (MANDATORY) ───────────────────────────────────────
      // Rule 1: NO browser opens before this gate passes. We have a plan but no
      // Chromium yet (browserState === 'IDLE'). The gate decides whether the
      // user must authorize the launch; if so we HOLD here until they respond.
      const gate = this.automationGate.evaluate(
        plan,
        parsedGoal,
        {
          approved: policyCheck.approved,
          overallRisk: policyCheck.overallRisk,
          blockedSteps: policyCheck.blockedSteps,
          requiresApprovalSteps: policyCheck.requiresApprovalSteps,
        },
        {
          mode: (config as any)?.mode,
          allowPayments: (config as any)?.allowPayments,
          allowLogin: (config as any)?.allowLogin,
        },
      );

      this.wsGateway.emitToSession(sessionId, 'automation:gate', {
        sessionId,
        proceed: gate.proceed,
        requiresApproval: gate.requiresApproval,
        riskLevel: gate.riskLevel,
        reason: gate.reason,
        targetDomains: gate.targetDomains,
        triggers: gate.triggers,
      });

      if (gate.requiresApproval) {
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'log:warn' as ExecutionEventType,
          data: { source: 'AutomationGate', message: `Launch held for approval — ${gate.reason}` },
        });

        const launchApproved = await this.requestLaunchApproval(sessionId, plan, gate);

        // User may have cancelled the whole session while we waited.
        if (this.sessionManager.get(sessionId)?.aborting) return;

        if (!launchApproved) {
          this.logger.log(`State Transition for session ${sessionId}: [IDLE] ──> [STOPPED] (launch denied)`);
          // Clear the gate first so the derived state doesn't stick on
          // WAITING_APPROVAL (e.g. when the gate timed out rather than being
          // explicitly denied via handleApprovalResponse).
          this.sessionManager.setGateState(sessionId, 'CLEARED');
          this.sessionManager.transitionBrowserState(sessionId, 'STOPPED');
          const deniedOutcome: CognitiveOutcome = {
            type: CognitiveOutcomeType.SAFE_ABORT,
            explanation: 'User denied browser launch at the automation gate',
            confidence: 1.0,
            timestamp: Date.now(),
          };
          await this.prisma.executionSession.update({
            where: { id: sessionId },
            data: {
              status: 'CANCELLED',
              completedAt: new Date(),
              metadata: {
                ...((session.metadata as Record<string, any>) || {}),
                cognitiveOutcome: deniedOutcome as any,
              } as any,
            },
          });
          this.wsGateway.emitToSession(sessionId, 'execution:event', {
            type: 'log:warn' as ExecutionEventType,
            data: { source: 'AutomationGate', message: '🚫 Launch denied — browser was never opened.' },
          });
          this.wsGateway.emitToSession(sessionId, 'execution:cancelled', { reason: 'launch_denied' });
          this.sessionManager.delete(sessionId);
          return;
        }

        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'log:info' as ExecutionEventType,
          data: { source: 'AutomationGate', message: '✅ Launch approved — opening browser.' },
        });
      }

      // Gate passed → hand off to the browser runtime. From here the runtime
      // (inline BrowserAgent/Streamer, or the Python worker) owns every
      // browser:state: INITIALIZING → READY → RUNNING. The orchestrator only
      // clears the gate; it never declares the browser running.
      this.sessionManager.setGateState(sessionId, 'CLEARED');

      // Check for structured Domain Adapter match first
      const firstStep = plan.steps[0];
      if (firstStep && firstStep.action === 'navigate' && firstStep.value) {
        const url = firstStep.value;
        const adapters = [new ZomatoAdapter(), new SwiggyAdapter()];
        let matchedAdapter = null;

        for (const adapter of adapters) {
          if (adapter.matches(url)) {
            matchedAdapter = adapter;
            break;
          }
        }

        if (matchedAdapter) {
          this.logger.log(`Domain Adapter MATCHED for URL: "${url}". Launching dedicated structured navigator.`);
          // The adapter IS the browser runtime here; launch() resolving is the
          // runtime confirming a live browser, so these transitions are truthful.
          this.sessionManager.transitionBrowserState(sessionId, 'INITIALIZING');
          const provider = new PlaywrightProvider();
          await provider.launch(sessionId, session.userId, { headless: config?.headless ?? true });
          this.sessionManager.transitionBrowserState(sessionId, 'RUNNING');
          
          this.wsGateway.emitToSession(sessionId, 'execution:event', {
            type: 'agent:thinking',
            data: { message: `Domain Adapter active. Navigating ${url} structurally.` },
          });

          const adapterResult = await matchedAdapter.executeGoal(provider, sessionId, goal);
          await provider.close(sessionId);
          this.sessionManager.transitionBrowserState(sessionId, 'STOPPED');

          await this.prisma.executionSession.update({
            where: { id: sessionId },
            data: {
              status: adapterResult.success ? 'COMPLETED' : 'FAILED',
              completedAt: new Date(),
              errorMessage: adapterResult.error || null,
            },
          });

          this.wsGateway.emitToSession(sessionId, 'execution:completed', {
            status: adapterResult.success ? 'success' : 'failed',
            reason: adapterResult.error,
          });

          this.sessionManager.delete(sessionId);
          return;
        }
      }

      // When no site plugin matched, let the Python engine run a real local skill
      // (search → extract → act, rule-based) instead of a weak generic plan.
      // 'job' → the full autonomous applier (login → score → fill → approve →
      // submit), so a dashboard goal like "apply to AI jobs" runs end-to-end.
      // It stays safe via JOB_AGENT_DRY_RUN (default) + approve-before-submit and
      // uses the user's tuned preferences.yaml when no explicit prefs are passed.
      const SKILL_BY_DOMAIN: Record<string, string> = {
        job: 'job_application',
        shopping: 'shopping',
        food: 'food',
        research: 'research',
        social: 'social',
        email: 'email',
        media: 'media',
      };
      // These domains are implemented by the autonomous Python skills (real
      // search / extract / apply, LLM-optional), NOT the inline site-plugin step
      // plans. The registry domain agents resolve with plugin ids
      // (matchedSkills != []), which would otherwise suppress the skill route and
      // run an incomplete inline plan — e.g. only "Initialize runtime" when the
      // LLM planner is unavailable, or a broken "navigate: missing URL". So
      // whenever a domain HAS a Python skill, always use it (executor.py ignores
      // the step plan when a skill is set). Domains without one (travel) keep the
      // inline plugin plan; an unmatched goal falls back to the cognitive
      // 'web_task' agent (observe→reason→act on any site; it degrades to the
      // generic search skill when the local model is unavailable).
      const skillHint =
        SKILL_BY_DOMAIN[routed.domain] ||
        (routed.matchedSkills.length === 0 ? 'web_task' : undefined);

      const dispatched = await this.workerDispatcher.dispatch(
        sessionId,
        session.taskId,
        session.userId,
        goal,
        plan,
        executionGraph,
        config,
        skillHint,
      );
      if (dispatched) {
        // The Python worker owns the browser now and emits its lifecycle
        // (INITIALIZING → READY → RUNNING) via worker:browser_state → relay.
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'log:info' as ExecutionEventType,
          data: {
            source: 'WorkerRuntime',
            message: `Execution delegated to browser worker (${plan.steps.length} steps). Live stream starting...`,
          },
        });
        return;
      }

      // A skill-routed goal (job/shopping/food/research/social) can ONLY run on
      // the Python engine — that's where the real automation AND the smooth CDP
      // live stream live. The inline Puppeteer fallback can only replay a step
      // plan with choppy screenshots, which for a skill goal means a broken run
      // (e.g. "navigate: missing URL") + a useless screenshot view. So fail fast
      // with an actionable message instead of silently degrading.
      if (skillHint) {
        const message =
          'Live browser engine (Python) is offline — the autonomous run and the ' +
          'live Chromium stream both run there. Start it:  python apps/browser-py/main.py  ' +
          '(headful), then relaunch. The browser will open and stream live.';
        this.logger.error(
          `[ExecutionEngine] Python engine offline for skill "${skillHint}" — refusing inline fallback (no live stream / cannot run skill).`,
        );
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'log:error' as ExecutionEventType,
          data: { source: 'WorkerRuntime', message },
        });
        throw new Error(message);
      }

      // Step 3: Create browser session (inline fallback)
      await this.browserAgent.createSession(sessionId, config);
      this.wsGateway.emitToSession(sessionId, 'browser:initialized', {});

      // Step 4: Start screenshot streaming. The inline runtime declares RUNNING
      // when the first real frame is produced (in ScreenshotStreamer) — never
      // guessed here. createSession already moved IDLE → INITIALIZING → READY.
      this.screenshotStreamer.startStreaming(sessionId, 500);

      // ── Step 5: Execute steps ─────────────────────────────────────────────
      let completedSuccessfully = true;
      let failureReason: string | null = null;
      let stepsCompleted = 0;
      let stepsFailed = 0;
      const sessionState = this.sessionManager.get(sessionId);
      if (sessionState) {
        sessionState.matchedPluginIds = routed.matchedSkills;
        sessionState.routedDomain = routed.domain;
      }

      // Phase mapping for drift sensitivity: transaction phase is strictest
      const inferDriftPhase = (stepIndex: number, totalSteps: number): 'research' | 'selection' | 'transaction' => {
        const ratio = stepIndex / Math.max(totalSteps - 1, 1);
        if (ratio < 0.35) return 'research';
        if (ratio < 0.75) return 'selection';
        return 'transaction';
      };

      for (const step of plan.steps) {
        if (this.sessionManager.get(sessionId)?.aborting) {
          break;
        }

        // ── COS: Pre-step drift evaluation ───────────────────────────────
        if (step.index > 0) {
          const driftPhase = inferDriftPhase(step.index, plan.steps.length);
          const drift = await this.driftDetector.evaluateDrift(sessionId, driftPhase);

          this.wsGateway.emitToSession(sessionId, 'cos:drift', {
            stepIndex: step.index,
            similarity: drift.similarity,
            isDrifted: drift.isDrifted,
            type: drift.type,
            phase: driftPhase,
            explanation: drift.explanation,
          });

          this.wsGateway.emitToSession(sessionId, 'execution:event', {
            type: 'log:info' as ExecutionEventType,
            data: {
              source: 'DriftDetector',
              message: drift.explanation,
              similarity: drift.similarity,
              driftType: drift.type,
            },
          });

          // Hard abort on DISTRACTION drift — agent wandered off-goal
          if (drift.isDrifted && drift.type === 'DISTRACTION') {
            this.logger.warn(`[COS] DISTRACTION drift detected at step ${step.index}. Aborting session.`);
            completedSuccessfully = false;
            failureReason = `Cognitive drift abort: ${drift.explanation}`;
            if (sessionState) sessionState.errorHistory.push(`[DriftDetector] ${failureReason}`);

            this.wsGateway.emitToSession(sessionId, 'cos:drift_abort', {
              stepIndex: step.index,
              reason: failureReason,
              similarity: drift.similarity,
            });
            this.wsGateway.emitToSession(sessionId, 'execution:event', {
              type: 'log:error' as ExecutionEventType,
              data: { source: 'CognitiveOS', message: `🛑 Drift Abort: ${failureReason}` },
            });
            break;
          }

          // CONSTRAINT_INDUCED drift: emit alert but continue with re-anchor note
          if (drift.isDrifted && drift.type === 'CONSTRAINT_INDUCED') {
            this.wsGateway.emitToSession(sessionId, 'execution:event', {
              type: 'log:warn' as ExecutionEventType,
              data: {
                source: 'DriftDetector',
                message: `⚓ Constraint-induced drift: re-anchoring trajectory. ${drift.explanation}`,
              },
            });
          }

          // ── COS: Feed drift similarity into CPN ──────────────────────────────────
          this.cpn.recordConfidence(sessionId, 'drift', drift.similarity, 1.5, 0.001);

          // Also pipe WSO composite confidence into CPN
          const wsoState = this.worldState.getState(sessionId);
          if (wsoState) {
            this.cpn.recordConfidence(sessionId, 'wso', wsoState.stateConfidence, 1.0, 0.003);
          }
        }

        // ── COS: Cognitive Gate — evaluate CPN before executing step ─────────────
        const sessionProfile = (this.sessionManager.get(sessionId)?.profile ?? 'balanced') as 'conservative' | 'balanced' | 'aggressive';
        const gate = this.cpn.evaluateGate(sessionId, sessionProfile);

        // Always emit structured gate event — frontend panel consumes this directly
        this.wsGateway.emitToSession(sessionId, 'cos:cpn_gate', {
          stepIndex: step.index,
          decision: gate.decision,
          systemConfidence: gate.systemConfidence,
          profile: sessionProfile,
          reasoning: gate.reasoning,
          weakestNode: gate.weakestNode,
          thresholds: {
            abort: gate.thresholds.abortThreshold,
            pause: gate.thresholds.pauseThreshold,
            warn:  gate.thresholds.warnThreshold,
          },
          timestamp: Date.now(),
        });

        if (gate.decision !== 'proceed') {
          // Always log the gate decision
          this.wsGateway.emitToSession(sessionId, 'execution:event', {
            type: `log:${gate.decision === 'warn' ? 'warn' : 'error'}` as ExecutionEventType,
            data: {
              source: 'CognitiveGate',
              message: `🧠 [CPN Gate] ${gate.decision.toUpperCase()} — ${gate.reasoning}`,
              systemConfidence: gate.systemConfidence,
              profile: sessionProfile,
            },
          });

          if (gate.decision === 'abort') {
            completedSuccessfully = false;
            failureReason = `Cognitive Gate abort: ${gate.reasoning}`;
            if (sessionState) sessionState.errorHistory.push(`[CognitiveGate] ${failureReason}`);
            this.wsGateway.emitToSession(sessionId, 'cos:drift_abort', {
              stepIndex: step.index,
              reason: failureReason,
              similarity: gate.systemConfidence,
            });
            break;
          }

          if (gate.decision === 'pause') {
            // Pause execution and notify user — they can resume/cancel
            await this.prisma.executionSession.update({
              where: { id: sessionId },
              data: { status: 'PAUSED' },
            });
            this.wsGateway.emitToSession(sessionId, 'execution:paused', {
              reason: 'cognitive_gate',
              message: gate.reasoning,
              systemConfidence: gate.systemConfidence,
            });
            // Wait for resume signal (poll every 2s, max 120s)
            let waited = 0;
            while (waited < 120000) {
              await new Promise((r) => setTimeout(r, 2000));
              waited += 2000;
              const current = await this.prisma.executionSession.findUnique({ where: { id: sessionId } });
              if (current?.status === 'RUNNING') break;
              if (current?.status === 'CANCELLED' || this.sessionManager.get(sessionId)?.aborting) {
                completedSuccessfully = false;
                failureReason = 'Cancelled during cognitive gate pause';
                break;
              }
            }
            if (!completedSuccessfully) break;
          }
          // 'warn' falls through — execution continues, user is informed
        }

        // Emit tool routing decision for frontend transparency
        const routeDesc = this.toolRouter.describeRoute(step);
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'log:info' as ExecutionEventType,
          data: { source: 'ToolRouter', message: `Step[${step.index}] → ${routeDesc}` },
        });

        try {
          const stepResult = await this.executeStep(sessionId, step, plan);
          if (sessionState) sessionState.stepResults.push(stepResult);

          if (stepResult.success) {
            stepsCompleted++;

            // ── COS: Record completed step for drift trajectory ───────────
            await this.driftDetector.recordStep(
              sessionId,
              step.index,
              step.action,
              step.description,
              stepResult.data ? JSON.stringify(stepResult.data).substring(0, 300) : 'Step executed successfully.',
            );

            // ── COS: Emit updated WSO telemetry ──────────────────────────
            const wso = this.worldState.getState(sessionId);
            if (wso) {
              this.wsGateway.emitToSession(sessionId, 'cos:world_state', {
                stateConfidence: wso.stateConfidence,
                beliefSourceConsensus: wso.beliefSourceConsensus,
                version: wso.version,
                belief: Object.fromEntries(
                  Object.entries(wso.belief).map(([k, v]) => [k, { value: v.value, confidence: v.sourceConfidence, source: v.source }])
                ),
              });
            }
          } else {
            stepsFailed++;
            completedSuccessfully = false;
            failureReason = 'Step execution failed';
            if (sessionState) sessionState.errorHistory.push(`Step ${step.index}: ${step.description} — failed`);

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
          stepsFailed++;
          completedSuccessfully = false;
          failureReason = error.message;
          if (sessionState) sessionState.errorHistory.push(`Step ${step.index}: ${error.message}`);
          break;
        }
      }

      // ── Step 6: Cleanup browser and CPN ───────────────────────────────────────
      this.screenshotStreamer.stopStreaming(sessionId);
      await this.browserAgent.closeSession(sessionId);
      // CPN session data is ephemeral — clear after run
      this.cpn.clearSession(sessionId);

      const durationMs = Date.now() - executionStart;
      const errorHistory = sessionState?.errorHistory || [];
      const currentParsedGoal = sessionState?.parsedGoal || parsedGoal;

      // ── Step 7: VerifierAgent — did we actually achieve the goal? ─────────
      let verificationResult: any = null;
      if (currentParsedGoal) {
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'log:info' as ExecutionEventType,
          data: { source: 'VerifierAgent', message: 'Verifying execution against original intent...' },
        });

        const executionSummary: ExecutionSummary = {
          goal,
          parsedGoal: currentParsedGoal,
          plan,
          stepsCompleted,
          stepsFailed,
          totalSteps: plan.steps.length,
          errorHistory,
          durationMs,
          matchedPluginIds: sessionState?.matchedPluginIds || plan.skillsUsed,
        };

        verificationResult = await this.verifierAgent.verify(executionSummary);

        // \u2500\u2500 COS: Pipe verifier score into CPN (final sensor reading) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        this.cpn.recordConfidence(sessionId, 'verifier', verificationResult.score ?? 0.5, 2.0, 0);

        // Emit verification result to frontend
        this.wsGateway.emitToSession(sessionId, 'execution:verified', {
          verified: verificationResult.verified,
          confidence: verificationResult.confidence,
          score: verificationResult.score,
          summary: verificationResult.summary,
          gaps: verificationResult.gaps,
          achievements: verificationResult.achievements,
          nextAction: verificationResult.nextAction,
          reasoning: verificationResult.reasoning,
          evidence: verificationResult.evidence,
        });

        this.logger.log(
          `VerifierAgent result: score=${verificationResult.score}, verified=${verificationResult.verified}, nextAction=${verificationResult.nextAction}`
        );

        // If verifier says retry/replan and we were "successful" by step count, correct the status
        if (completedSuccessfully && !verificationResult.verified && verificationResult.nextAction === 'replan') {
          completedSuccessfully = false;
          failureReason = `VerifierAgent: Goal not fully achieved. Gaps: ${verificationResult.gaps.join('; ')}`;
        }
      }

      // ── Step 8: Store episodic memory ─────────────────────────────────────
      if (completedSuccessfully) {
        const stepsSummary = plan.steps.map(s => `${s.action}(${s.target})`).join(' → ');
        await this.memory.store(
          session.userId,
          `Success: ${goal}`,
          MemoryType.EPISODIC,
          {
            taskId: session.taskId,
            summary: stepsSummary,
            metadata: { duration: durationMs },
          },
        );

        // ── Step 9: Store strategy pattern for future recall ─────────────────
        if (currentParsedGoal) {
          await this.strategyMemory.storeSuccessfulStrategy(
            session.userId,
            goal,
            currentParsedGoal,
            plan,
            durationMs,
          );
          this.wsGateway.emitToSession(sessionId, 'execution:event', {
            type: 'log:info' as ExecutionEventType,
            data: { source: 'StrategyMemory', message: 'Strategy pattern saved for future task recall' },
          });

          // Auto-learn domain preferences from successfully executed plugins/skills
          const categoryMap: Record<string, string> = {
            job_search: 'job',
            food_order: 'food',
            shopping: 'shopping',
            price_comparison: 'shopping',
            ticket_booking: 'travel',
            hotel_booking: 'travel',
            flight_search: 'travel',
          };
          const category = categoryMap[currentParsedGoal.taskType] || sessionState?.routedDomain || 'general';
          const pluginIds = sessionState?.matchedPluginIds?.length
            ? sessionState.matchedPluginIds
            : (plan.skillsUsed || []).filter((id) => id.includes('-'));
          if (pluginIds.length > 0) {
            for (const pluginId of pluginIds) {
              await this.preferenceMemory.autoLearn(session.userId, category, pluginId);
            }
            const updatedPrefs = await this.preferenceMemory.getPreferences(session.userId);
            this.wsGateway.emitToSession(sessionId, 'memory:preferences_updated', {
              sessionId,
              preferences: updatedPrefs,
              learnedFrom: pluginIds,
            });
          }
        }
      } else if (currentParsedGoal && errorHistory.length > 0) {
        // Store failure pattern so planner avoids this approach next time
        await this.strategyMemory.storeFailurePattern(
          session.userId,
          goal,
          currentParsedGoal,
          errorHistory,
          stepsCompleted,
        );
      }

      // Determine final cognitive outcome type and explanation
      let outcomeType = CognitiveOutcomeType.SUCCESS;
      let outcomeExplanation = 'Goal completed successfully.';
      
      if (!completedSuccessfully) {
        if (failureReason?.includes('drift') || failureReason?.includes('Cognitive Gate') || failureReason?.includes('CPN Gate') || failureReason?.includes('abort')) {
          outcomeType = CognitiveOutcomeType.SAFE_ABORT;
          outcomeExplanation = failureReason;
        } else if (failureReason?.includes('Cancelled') || failureReason?.includes('pause') || failureReason?.includes('escalat')) {
          outcomeType = CognitiveOutcomeType.ESCALATED;
          outcomeExplanation = failureReason;
        } else {
          outcomeType = CognitiveOutcomeType.FAILED;
          outcomeExplanation = failureReason || 'Execution failed due to step or system errors.';
        }
      }

      const systemConfidence = this.cpn.computeSystemConfidence(sessionId).systemConfidence;
      const cognitiveOutcome: CognitiveOutcome = {
        type: outcomeType,
        explanation: outcomeExplanation,
        confidence: systemConfidence,
        timestamp: Date.now(),
      };

      // ── Step 10: Update final DB status ──────────────────────────────────
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          status: completedSuccessfully ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          errorMessage: failureReason,
          metadata: {
            ...(session.metadata as Record<string, any> || {}),
            cognitiveOutcome: cognitiveOutcome as any,
          } as any
        },
      });

      this.wsGateway.emitToSession(sessionId, 'execution:completed', {
        status: completedSuccessfully ? 'success' : 'failed',
        reason: failureReason,
        cognitiveOutcome,
        verification: verificationResult ? {
          verified: verificationResult.verified,
          score: verificationResult.score,
          summary: verificationResult.summary,
        } : null,
      });

      // ── Step 11: Async post-run COS reflection (non-blocking) ─────────
      if (currentParsedGoal) {
        this.reflection.reflect(
          sessionId,
          session.userId,
          goal,
          currentParsedGoal,
          plan,
          sessionState?.stepResults || [],
          errorHistory,
          completedSuccessfully,
        );
      }

      // ── Step 12: Emit final WSO state + clean up COS contexts ────────
      const finalWso = this.worldState.getState(sessionId);
      if (finalWso) {
        this.wsGateway.emitToSession(sessionId, 'cos:world_state_final', {
          stateConfidence: finalWso.stateConfidence,
          beliefSourceConsensus: finalWso.beliefSourceConsensus,
          version: finalWso.version,
          historyLength: Object.keys(finalWso.history).length,
        });
      }
      this.worldState.removeSession(sessionId);
      this.driftDetector.clearSession(sessionId);

      this.sessionManager.delete(sessionId);
    } catch (error: any) {
      this.logger.error(`Execution failed: ${error.message}`);
      const systemConfidence = this.cpn.computeSystemConfidence(sessionId).systemConfidence;
      const errorOutcome: CognitiveOutcome = {
        type: CognitiveOutcomeType.FAILED,
        explanation: `Internal execution engine failure: ${error.message}`,
        confidence: systemConfidence,
        timestamp: Date.now(),
      };

      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
          metadata: {
            ...(session?.metadata as Record<string, any> || {}),
            cognitiveOutcome: errorOutcome as any,
          } as any
        },
      });

      this.wsGateway.emitToSession(sessionId, 'execution:failed', {
        reason: 'error',
        message: error.message,
        cognitiveOutcome: errorOutcome,
      });

      this.sessionManager.delete(sessionId);
    }
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
      this.wsGateway.emitToSession(sessionId, 'step:blocked', {
        stepIndex: step.index,
        reason: policyCheck.reason,
      });
      return { success: false, error: `Policy blocked: ${policyCheck.reason}` };
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
      this.wsGateway.emitToSession(sessionId, 'step:failed', {
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
      
      this.wsGateway.emitToSession(sessionId, 'execution:event', {
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
      this.wsGateway.emitToSession(sessionId, 'execution:event', {
        type: 'execution_state_changed',
        data: { sessionId, oldState: 'executing', newState: blockerType.toLowerCase() }
      });

      const approved = await this.requestApproval(
        sessionId,
        mockStep,
        userRiskLevel,
      );

      if (!approved) {
        this.wsGateway.emitToSession(sessionId, 'step:denied', { stepIndex: step.index });
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

    this.wsGateway.emitToSession(sessionId, 'step:completed', {
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

    this.wsGateway.emitToSession(sessionId, 'approval:requested', {
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
        this.wsGateway.emitToSession(sessionId, 'approval:expired', {
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
    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'execution_state_changed',
      data: { sessionId, oldState: 'executing', newState: 'paused' }
    });

    this.screenshotStreamer.stopStreaming(sessionId);
    // PAUSED is a runtime state; the authority's recompute persists it.
    this.sessionManager.transitionBrowserState(sessionId, 'PAUSED');
    this.wsGateway.emitToSession(sessionId, 'execution:paused', {});
  }

  async resumeExecution(sessionId: string): Promise<void> {
    this.logger.log(`Resuming execution: ${sessionId}`);

    this.logger.log(`State Transition for session ${sessionId}: [PAUSED] ──> [RUNNING]`);
    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'execution_state_changed',
      data: { sessionId, oldState: 'paused', newState: 'executing' }
    });

    this.screenshotStreamer.startStreaming(sessionId, 500);
    // Resuming a confirmed-alive browser (PAUSED → RUNNING) is not fabrication —
    // the browser already exists. The authority's recompute persists RUNNING.
    this.sessionManager.transitionBrowserState(sessionId, 'RUNNING');
    this.wsGateway.emitToSession(sessionId, 'execution:resumed', {});
  }

  async cancelExecution(sessionId: string): Promise<void> {
    this.logger.log(`Cancelling execution: ${sessionId}`);

    const state = this.sessionManager.get(sessionId);
    if (state) {
      state.aborting = true;
    }

    this.logger.log(`State Transition for session ${sessionId}: [RUNNING/PAUSED] ──> [CANCELLED]`);
    this.wsGateway.emitToSession(sessionId, 'execution:event', {
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

    this.wsGateway.emitToSession(sessionId, 'execution:cancelled', {});
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
