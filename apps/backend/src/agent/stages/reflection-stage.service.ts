import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReflectionService } from '../reflection.service';
import { CognitiveCircuitBreaker } from './circuit-breaker.service';
import { WorldStateSensor } from './world-state-sensor.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext, PipelineExitReason } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';
import {
  CognitiveOutcome,
  CognitiveOutcomeType,
} from '../../shared/interfaces/agent.interfaces';

@Injectable()
export class ReflectionStage implements IExecutionStage {
  private readonly logger = new Logger(ReflectionStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflection: ReflectionService,
    private readonly circuitBreaker: CognitiveCircuitBreaker,
    private readonly worldStateSensor: WorldStateSensor,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    ctx.durationMs = Date.now() - ctx.executionStart;

    // Determine cognitive outcome
    let outcomeType = CognitiveOutcomeType.SUCCESS;
    let outcomeExplanation = 'Goal completed successfully.';

    if (!ctx.completedSuccessfully) {
      const reason = ctx.failureReason ?? '';
      if (/drift|Cognitive Gate|CPN Gate|abort/i.test(reason)) {
        outcomeType = CognitiveOutcomeType.SAFE_ABORT;
        outcomeExplanation = reason;
      } else if (/Cancelled|pause|escalat/i.test(reason)) {
        outcomeType = CognitiveOutcomeType.ESCALATED;
        outcomeExplanation = reason;
      } else {
        outcomeType = CognitiveOutcomeType.FAILED;
        outcomeExplanation = reason || 'Execution failed due to step or system errors.';
      }
    }

    const systemConfidence = this.circuitBreaker.computeSystemConfidence(ctx.sessionId);
    ctx.systemConfidence = systemConfidence;

    const cognitiveOutcome: CognitiveOutcome = {
      type: outcomeType,
      explanation: outcomeExplanation,
      confidence: systemConfidence,
      timestamp: Date.now(),
    };
    ctx.cognitiveOutcome = cognitiveOutcome;

    // Final DB write
    await this.prisma.executionSession.update({
      where: { id: ctx.sessionId },
      data: {
        status: ctx.completedSuccessfully ? 'COMPLETED' : 'FAILED',
        completedAt: new Date(),
        errorMessage: ctx.failureReason,
        metadata: { cognitiveOutcome: cognitiveOutcome as any } as any,
      },
    });

    this.eventBus.emit(ctx.sessionId, 'execution:completed', {
      status: ctx.completedSuccessfully ? 'success' : 'failed',
      reason: ctx.failureReason,
      cognitiveOutcome,
      verification: ctx.verificationResult
        ? { verified: ctx.verificationResult.verified, score: ctx.verificationResult.score, summary: ctx.verificationResult.summary }
        : null,
    });

    // Async reflection (non-blocking)
    if (ctx.parsedGoal && ctx.plan) {
      this.reflection.reflect(
        ctx.sessionId,
        ctx.userId!,
        ctx.goal,
        ctx.parsedGoal,
        ctx.plan,
        ctx.stepResults,
        ctx.errorHistory,
        ctx.completedSuccessfully,
      );
    }

    // Final WSO emit
    this.worldStateSensor.emitWorldStateFinal(ctx);
  }

  async handleError(ctx: ExecutionContext, error: Error): Promise<void> {
    this.logger.error(`Execution failed: ${error.message}`);

    const systemConfidence = this.circuitBreaker.computeSystemConfidence(ctx.sessionId);
    const errorOutcome: CognitiveOutcome = {
      type: CognitiveOutcomeType.FAILED,
      explanation: `Internal execution engine failure: ${error.message}`,
      confidence: systemConfidence,
      timestamp: Date.now(),
    };

    await this.prisma.executionSession.update({
      where: { id: ctx.sessionId },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        completedAt: new Date(),
        metadata: { cognitiveOutcome: errorOutcome as any } as any,
      },
    });

    this.eventBus.emit(ctx.sessionId, 'execution:failed', {
      reason: 'error',
      message: error.message,
      cognitiveOutcome: errorOutcome,
    });
  }
}
