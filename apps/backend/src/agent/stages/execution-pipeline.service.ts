import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionManagerService } from '../runtime/session-manager.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext, PipelineExitReason } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';
import { GoalPlanningStage } from './goal-planning-stage.service';
import { PolicyCheckStage } from './policy-check-stage.service';
import { AutomationGateStage } from './automation-gate-stage.service';
import { WorkerDispatchStage } from './worker-dispatch-stage.service';
import { StepExecutionStage } from './step-execution-stage.service';
import { VerificationStage } from './verification-stage.service';
import { MemoryStage } from './memory-stage.service';
import { ReflectionStage } from './reflection-stage.service';
import { BrowserSessionConfig } from '../../shared/interfaces/agent.interfaces';
import { ParsedGoal } from '../goal-understanding.service';

@Injectable()
export class ExecutionPipelineService {
  private readonly logger = new Logger(ExecutionPipelineService.name);

  constructor(
    private readonly goalPlanningStage: GoalPlanningStage,
    private readonly policyCheckStage: PolicyCheckStage,
    private readonly automationGateStage: AutomationGateStage,
    private readonly workerDispatchStage: WorkerDispatchStage,
    private readonly stepExecutionStage: StepExecutionStage,
    private readonly verificationStage: VerificationStage,
    private readonly memoryStage: MemoryStage,
    private readonly reflectionStage: ReflectionStage,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async run(
    sessionId: string,
    goal: string,
    config?: Partial<BrowserSessionConfig>,
    parsedGoal?: ParsedGoal,
  ): Promise<void> {
    const ctx = new ExecutionContext(sessionId, goal, config, parsedGoal);
    const executionStart = Date.now();

    try {
      await this.goalPlanningStage.execute(ctx);
      if (ctx.exitReason) return;

      await this.policyCheckStage.execute(ctx);
      if (ctx.exitReason) return;

      await this.automationGateStage.execute(ctx);
      if (ctx.exitReason) return;
      if (this.sessionManager.get(sessionId)?.aborting) return;

      await this.workerDispatchStage.execute(ctx);
      if (ctx.exitReason) return;
      if (ctx.dispatchedToWorker) return;
      if (this.sessionManager.get(sessionId)?.aborting) return;

      if (ctx.executedInline) {
        await this.stepExecutionStage.execute(ctx);

        // Post-execution stages only for inline execution
        await this.verificationStage.execute(ctx);
        await this.memoryStage.execute(ctx);
        await this.reflectionStage.execute(ctx);
      }

      ctx.durationMs = Date.now() - executionStart;
    } catch (error: any) {
      this.logger.error(`Pipeline execution failed: ${error.message}`);
      await this.handleError(ctx, error.message);
      return;
    }

    // ── Final cleanup ──
    await this.finalizeSession(ctx);
  }

  private async handleError(ctx: ExecutionContext, errorMessage: string): Promise<void> {
    const { sessionId } = ctx;
    this.logger.error(`Execution failed for session ${sessionId}: ${errorMessage}`);

    try {
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });

      this.eventBus.emit(sessionId, 'execution:failed', {
        reason: 'error',
        message: errorMessage,
      });
    } catch {
      // swallow finalization errors
    }

    this.sessionManager.delete(sessionId);
  }

  private async finalizeSession(ctx: ExecutionContext): Promise<void> {
    this.sessionManager.delete(ctx.sessionId);
  }
}
