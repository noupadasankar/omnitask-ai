import { Injectable, Logger } from '@nestjs/common';
import { VerifierAgentService, ExecutionSummary } from '../verifier-agent.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { CognitiveCircuitBreaker } from './circuit-breaker.service';
import { ExecutionContext } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';

@Injectable()
export class VerificationStage implements IExecutionStage {
  private readonly logger = new Logger(VerificationStage.name);

  constructor(
    private readonly verifierAgent: VerifierAgentService,
    private readonly eventBus: ExecutionEventBus,
    private readonly circuitBreaker: CognitiveCircuitBreaker,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    if (!ctx.parsedGoal) return;

    this.eventBus.emit(ctx.sessionId, 'execution:event', {
      type: 'log:info',
      data: { source: 'VerifierAgent', message: 'Verifying execution against original intent...' },
    });

    const executionSummary: ExecutionSummary = {
      goal: ctx.goal,
      parsedGoal: ctx.parsedGoal,
      plan: ctx.plan!,
      stepsCompleted: ctx.stepsCompleted,
      stepsFailed: ctx.stepsFailed,
      totalSteps: ctx.totalSteps,
      errorHistory: ctx.errorHistory,
      durationMs: ctx.durationMs,
      matchedPluginIds: ctx.plan?.skillsUsed,
    };

    const result = await this.verifierAgent.verify(executionSummary);
    ctx.verificationResult = result;

    this.circuitBreaker.recordConfidence(ctx.sessionId, 'verifier', result.score ?? 0.5, 2.0, 0);

    this.eventBus.emit(ctx.sessionId, 'execution:verified', {
      verified: result.verified,
      confidence: result.confidence,
      score: result.score,
      summary: result.summary,
      gaps: result.gaps,
      achievements: result.achievements,
      nextAction: result.nextAction,
      reasoning: result.reasoning,
      evidence: result.evidence,
    });

    this.logger.log(`VerifierAgent result: score=${result.score}, verified=${result.verified}, nextAction=${result.nextAction}`);

    if (ctx.completedSuccessfully && !result.verified && result.nextAction === 'replan') {
      ctx.completedSuccessfully = false;
      ctx.failureReason = `VerifierAgent: Goal not fully achieved. Gaps: ${result.gaps.join('; ')}`;
    }
  }
}
