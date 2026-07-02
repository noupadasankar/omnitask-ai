import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionManagerService } from '../runtime/session-manager.service';
import { DriftDetectorService } from '../drift-detector.service';
import { ConfidenceNetworkService } from '../confidence-network.service';
import { WorldStateService } from '../world-state.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext } from './execution-context';
import { AgentPlan, PlannedStep, ExecutionEventType } from '../../shared/interfaces/agent.interfaces';

export interface CognitiveGateResult {
  shouldAbort: boolean;
  shouldPause: boolean;
  shouldWarn: boolean;
  failureReason: string | null;
  pauseResolved: boolean;
}

@Injectable()
export class CognitiveCircuitBreaker {
  private readonly logger = new Logger(CognitiveCircuitBreaker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionManager: SessionManagerService,
    private readonly driftDetector: DriftDetectorService,
    private readonly cpn: ConfidenceNetworkService,
    private readonly worldState: WorldStateService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  private inferDriftPhase(stepIndex: number, totalSteps: number): 'research' | 'selection' | 'transaction' {
    const ratio = stepIndex / Math.max(totalSteps - 1, 1);
    if (ratio < 0.35) return 'research';
    if (ratio < 0.75) return 'selection';
    return 'transaction';
  }

  async preStep(ctx: ExecutionContext, step: PlannedStep, plan: AgentPlan): Promise<CognitiveGateResult> {
    const { sessionId } = ctx;

    // ── Drift evaluation (runs step.index > 0) ──
    if (step.index > 0) {
      const driftPhase = this.inferDriftPhase(step.index, plan.steps.length);
      const drift = await this.driftDetector.evaluateDrift(sessionId, driftPhase);

      this.eventBus.emit(sessionId, 'cos:drift', {
        stepIndex: step.index,
        similarity: drift.similarity,
        isDrifted: drift.isDrifted,
        type: drift.type,
        phase: driftPhase,
        explanation: drift.explanation,
      });

      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:info',
        data: { source: 'DriftDetector', message: drift.explanation, similarity: drift.similarity, driftType: drift.type },
      });

      if (drift.isDrifted && drift.type === 'DISTRACTION') {
        this.logger.warn(`[COS] DISTRACTION drift detected at step ${step.index}. Aborting session.`);
        ctx.completedSuccessfully = false;
        ctx.failureReason = `Cognitive drift abort: ${drift.explanation}`;
        ctx.errorHistory.push(`[DriftDetector] ${ctx.failureReason}`);

        this.eventBus.emit(sessionId, 'cos:drift_abort', {
          stepIndex: step.index,
          reason: ctx.failureReason,
          similarity: drift.similarity,
        });
        this.eventBus.emit(sessionId, 'execution:event', {
          type: 'log:error',
          data: { source: 'CognitiveOS', message: `Drift Abort: ${ctx.failureReason}` },
        });
        return { shouldAbort: true, shouldPause: false, shouldWarn: false, failureReason: ctx.failureReason, pauseResolved: false };
      }

      if (drift.isDrifted && drift.type === 'CONSTRAINT_INDUCED') {
        this.eventBus.emit(sessionId, 'execution:event', {
          type: 'log:warn',
          data: { source: 'DriftDetector', message: `Constraint-induced drift: re-anchoring trajectory. ${drift.explanation}` },
        });
      }

      this.cpn.recordConfidence(sessionId, 'drift', drift.similarity, 1.5, 0.001);

      const wsoState = this.worldState.getState(sessionId);
      if (wsoState) {
        this.cpn.recordConfidence(sessionId, 'wso', wsoState.stateConfidence, 1.0, 0.003);
      }
    }

    // ── CPN Gate (runs every step) ──
    const sessionProfile = (this.sessionManager.get(sessionId)?.profile ?? 'balanced') as 'conservative' | 'balanced' | 'aggressive';
    const gate = this.cpn.evaluateGate(sessionId, sessionProfile);

    this.eventBus.emit(sessionId, 'cos:cpn_gate', {
      stepIndex: step.index,
      decision: gate.decision,
      systemConfidence: gate.systemConfidence,
      profile: sessionProfile,
      reasoning: gate.reasoning,
      weakestNode: gate.weakestNode,
      thresholds: { abort: gate.thresholds.abortThreshold, pause: gate.thresholds.pauseThreshold, warn: gate.thresholds.warnThreshold },
      timestamp: Date.now(),
    });

    if (gate.decision === 'abort') {
      ctx.completedSuccessfully = false;
      ctx.failureReason = `Cognitive Gate abort: ${gate.reasoning}`;
      ctx.errorHistory.push(`[CognitiveGate] ${ctx.failureReason}`);
      this.eventBus.emit(sessionId, 'cos:drift_abort', {
        stepIndex: step.index,
        reason: ctx.failureReason,
        similarity: gate.systemConfidence,
      });
      return { shouldAbort: true, shouldPause: false, shouldWarn: false, failureReason: ctx.failureReason, pauseResolved: false };
    }

    if (gate.decision === 'pause') {
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { status: 'PAUSED' },
      });
      this.eventBus.emit(sessionId, 'execution:paused', {
        reason: 'cognitive_gate',
        message: gate.reasoning,
        systemConfidence: gate.systemConfidence,
      });

      let waited = 0;
      let pauseResolved = true;
      while (waited < 120000) {
        await new Promise((r) => setTimeout(r, 2000));
        waited += 2000;
        const current = await this.prisma.executionSession.findUnique({ where: { id: sessionId } });
        if (current?.status === 'RUNNING') break;
        if (current?.status === 'CANCELLED' || this.sessionManager.get(sessionId)?.aborting) {
          ctx.completedSuccessfully = false;
          ctx.failureReason = 'Cancelled during cognitive gate pause';
          pauseResolved = false;
          break;
        }
      }
      if (!ctx.completedSuccessfully) {
        return { shouldAbort: false, shouldPause: true, shouldWarn: false, failureReason: ctx.failureReason, pauseResolved: false };
      }
    }

    if (gate.decision !== 'proceed') {
      this.eventBus.emit(sessionId, 'execution:event', {
        type: `log:${gate.decision === 'warn' ? 'warn' : 'error'}` as ExecutionEventType,
        data: {
          source: 'CognitiveGate',
          message: `[CPN Gate] ${gate.decision.toUpperCase()} — ${gate.reasoning}`,
          systemConfidence: gate.systemConfidence,
          profile: sessionProfile,
        },
      });
    }

    return { shouldAbort: false, shouldPause: false, shouldWarn: gate.decision === 'warn', failureReason: null, pauseResolved: true };
  }

  async recordStep(ctx: ExecutionContext, step: PlannedStep, stepResult: { success: boolean; data?: any }): Promise<void> {
    await this.driftDetector.recordStep(
      ctx.sessionId,
      step.index,
      step.action,
      step.description,
      stepResult.data ? JSON.stringify(stepResult.data).substring(0, 300) : 'Step executed successfully.',
    );
  }

  recordConfidence(sessionId: string, source: 'drift' | 'wso' | 'planner' | 'verifier', confidence: number, weight: number, decay: number): void {
    this.cpn.recordConfidence(sessionId, source, confidence, weight, decay);
  }

  computeSystemConfidence(sessionId: string): number {
    return this.cpn.computeSystemConfidence(sessionId).systemConfidence;
  }

  clearSession(sessionId: string): void {
    this.cpn.clearSession(sessionId);
    this.driftDetector.clearSession(sessionId);
  }
}
