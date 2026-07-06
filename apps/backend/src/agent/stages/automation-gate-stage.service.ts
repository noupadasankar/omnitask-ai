import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AutomationGateService } from '../runtime/automation-gate.service';
import { ShadowModeService } from '../shadow-mode.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionManagerService } from '../runtime/session-manager.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext, PipelineExitReason } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';
import { CognitiveOutcome, CognitiveOutcomeType } from '../../shared/interfaces/agent.interfaces';
import { ZomatoAdapter } from '../domain-adapters/zomato-adapter.service';
import { SwiggyAdapter } from '../domain-adapters/swiggy-adapter.service';
import { PlaywrightProvider } from '../providers/playwright-provider.service';

@Injectable()
export class AutomationGateStage implements IExecutionStage {
  private readonly logger = new Logger(AutomationGateStage.name);
  private approvalTimeouts = new Map<string, NodeJS.Timeout>();
  private pendingLaunchApprovals = new Map<string, string>();

  constructor(
    private readonly automationGate: AutomationGateService,
    private readonly shadowMode: ShadowModeService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    if (!ctx.plan) return;
    const { sessionId } = ctx;

    const gate = this.automationGate.evaluate(
      ctx.plan,
      ctx.parsedGoal,
      {
        approved: ctx.policyCheck?.approved ?? true,
        overallRisk: ctx.policyCheck?.overallRisk ?? 'LOW',
        blockedSteps: ctx.policyCheck?.blockedSteps ?? [],
        requiresApprovalSteps: ctx.policyCheck?.requiresApprovalSteps ?? [],
      },
      {
        mode: (ctx.config as any)?.mode,
        allowPayments: (ctx.config as any)?.allowPayments,
        allowLogin: (ctx.config as any)?.allowLogin,
      },
    );

    ctx.gateDecision = gate;

    this.eventBus.emit(sessionId, 'automation:gate', {
      sessionId,
      proceed: gate.proceed,
      requiresApproval: gate.requiresApproval,
      riskLevel: gate.riskLevel,
      reason: gate.reason,
      targetDomains: gate.targetDomains,
      triggers: gate.triggers,
    });

    if (gate.requiresApproval) {
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:warn',
        data: { source: 'AutomationGate', message: `Launch held for approval — ${gate.reason}` },
      });

      const launchApproved = await this.requestLaunchApproval(sessionId, ctx.plan, gate);
      if (this.sessionManager.get(sessionId)?.aborting) return;

      if (!launchApproved) {
        this.logger.log(`State Transition for session ${sessionId}: [IDLE] ──> [STOPPED] (launch denied)`);
        this.sessionManager.setGateState(sessionId, 'CLEARED');
        this.sessionManager.transitionBrowserState(sessionId, 'STOPPED');

        const deniedOutcome: CognitiveOutcome = {
          type: CognitiveOutcomeType.SAFE_ABORT,
          explanation: 'User denied browser launch at the automation gate',
          confidence: 1.0,
          timestamp: Date.now(),
        };

        const session = await this.prisma.executionSession.findUnique({ where: { id: sessionId } });

        await this.prisma.executionSession.update({
          where: { id: sessionId },
          data: {
            status: 'CANCELLED',
            completedAt: new Date(),
            metadata: { ...(session?.metadata as any || {}), cognitiveOutcome: deniedOutcome as any } as any,
          },
        });

        this.eventBus.emit(sessionId, 'execution:event', {
          type: 'log:warn',
          data: { source: 'AutomationGate', message: 'Launch denied — browser was never opened.' },
        });
        this.eventBus.emit(sessionId, 'execution:cancelled', { reason: 'launch_denied' });
        this.sessionManager.delete(sessionId);

        ctx.exitReason = PipelineExitReason.LAUNCH_DENIED;
        return;
      }

      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:info',
        data: { source: 'AutomationGate', message: 'Launch approved — opening browser.' },
      });
    }

    this.sessionManager.setGateState(sessionId, 'CLEARED');

    // ── Simulation mode ──
    const executionMode = (ctx.config as any)?.mode;
    if (executionMode === 'simulation') {
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:info',
        data: { source: 'ShadowMode', message: 'Simulation mode active — all actions are dry-run (no real browser).' },
      });

      const report = await this.shadowMode.runSimulation(ctx.userId!, ctx.taskId!, ctx.plan, sessionId);

      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          status: report.summary.wouldSucceed ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          errorMessage: report.summary.wouldSucceed ? null : `Simulation failed: ${report.summary.warnings.join('; ')}`,
        },
      });

      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:info',
        data: { source: 'ShadowMode', message: `Simulation complete: ${report.summary.totalActions} actions, wouldSucceed=${report.summary.wouldSucceed}` },
      });
      this.eventBus.emit(sessionId, 'shadow:report', { report });
      this.eventBus.emit(sessionId, 'execution:completed', {
        status: report.summary.wouldSucceed ? 'success' : 'failed',
        reason: report.summary.wouldSucceed ? null : report.summary.warnings.join('; '),
      });

      this.sessionManager.delete(sessionId);
      ctx.exitReason = PipelineExitReason.SIMULATION_COMPLETED;
      return;
    }

    // ── Domain adapter match ──
    const firstStep = ctx.plan.steps[0];
    if (firstStep && firstStep.action === 'navigate' && firstStep.value) {
      const url = firstStep.value;
      const adapters = [new ZomatoAdapter(), new SwiggyAdapter()];
      let matchedAdapter: any = null;
      for (const adapter of adapters) {
        if (adapter.matches(url)) { matchedAdapter = adapter; break; }
      }

      if (matchedAdapter) {
        this.logger.log(`Domain Adapter MATCHED for URL: "${url}". Launching dedicated structured navigator.`);
        this.sessionManager.transitionBrowserState(sessionId, 'INITIALIZING');
        const provider = new PlaywrightProvider();
        await provider.launch(sessionId, ctx.userId!, { headless: ctx.config?.headless ?? true });
        this.sessionManager.transitionBrowserState(sessionId, 'RUNNING');

        this.eventBus.emit(sessionId, 'execution:event', {
          type: 'agent:thinking',
          data: { message: `Domain Adapter active. Navigating ${url} structurally.` },
        });

        const adapterResult = await matchedAdapter.executeGoal(provider, sessionId, ctx.goal);
        await provider.close(sessionId);
        this.sessionManager.transitionBrowserState(sessionId, 'STOPPED');

        await this.prisma.executionSession.update({
          where: { id: sessionId },
          data: { status: adapterResult.success ? 'COMPLETED' : 'FAILED', completedAt: new Date(), errorMessage: adapterResult.error || null },
        });

        this.eventBus.emit(sessionId, 'execution:completed', { status: adapterResult.success ? 'success' : 'failed', reason: adapterResult.error });
        this.sessionManager.delete(sessionId);
        ctx.exitReason = PipelineExitReason.ADAPTER_COMPLETED;
        return;
      }
    }
  }

  cancelPendingApproval(sessionId: string): void {
    const aprId = this.pendingLaunchApprovals.get(sessionId);
    if (aprId) {
      clearTimeout(this.approvalTimeouts.get(aprId));
      this.approvalTimeouts.delete(aprId);
      this.pendingLaunchApprovals.delete(sessionId);
      this.eventEmitter.emit(`approval:${aprId}`, false);
    }
  }

  private async requestLaunchApproval(
    sessionId: string,
    plan: any,
    gate: { riskLevel: string; reason: string; targetDomains: string[] },
  ): Promise<boolean> {
    const description = `Launch browser & run ${plan.steps.length} step(s)${gate.targetDomains.length ? ` on ${gate.targetDomains.join(', ')}` : ''}`;

    const approvalRequest = await this.prisma.approvalRequest.create({
      data: {
        sessionId,
        stepIndex: -1,
        riskLevel: gate.riskLevel as any,
        description,
        actionDetails: { action: 'launch_browser', target: gate.targetDomains.join(', ') || undefined, description, gate: true, reason: gate.reason, targetDomains: gate.targetDomains, totalSteps: plan.steps.length } as any,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

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
      const req = await this.prisma.approvalRequest.findUnique({ where: { id: approvalRequest.id } });
      if (req && req.status === 'PENDING') {
        await this.prisma.approvalRequest.update({ where: { id: approvalRequest.id }, data: { status: 'EXPIRED' } });
        this.eventBus.emit(sessionId, 'approval:expired', { approvalRequestId: approvalRequest.id });
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
}
