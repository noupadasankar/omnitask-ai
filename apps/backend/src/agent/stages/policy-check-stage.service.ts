import { Injectable, Logger } from '@nestjs/common';
import { PolicyEngineService } from '../policy-engine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext, PipelineExitReason, PolicyCheckSummary } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';
import { CognitiveOutcome, CognitiveOutcomeType } from '../../shared/interfaces/agent.interfaces';

@Injectable()
export class PolicyCheckStage implements IExecutionStage {
  private readonly logger = new Logger(PolicyCheckStage.name);

  constructor(
    private readonly policyEngine: PolicyEngineService,
    private readonly prisma: PrismaService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    if (!ctx.plan) return;

    const policyCheck: PolicyCheckSummary = this.policyEngine.checkPlan(ctx.plan);
    ctx.policyCheck = policyCheck;

    if (!policyCheck.approved) {
      this.logger.log(`State Transition for session ${ctx.sessionId}: [RUNNING] ──> [FAILED] (Policy Blocked)`);
      this.eventBus.emit(ctx.sessionId, 'execution:event', {
        type: 'execution_state_changed',
        data: { sessionId: ctx.sessionId, oldState: 'executing', newState: 'failed' },
      });

      const firstBlocked = policyCheck.stepChecks.find((sc: any) => !sc.check.allowed);
      const policyReason = firstBlocked?.check.reason || 'Plan violates safety policies';
      const earlyOutcome: CognitiveOutcome = {
        type: CognitiveOutcomeType.SAFE_ABORT,
        explanation: `Safety policy block: ${policyReason}`,
        confidence: 1.0,
        timestamp: Date.now(),
      };

      await this.prisma.executionSession.update({
        where: { id: ctx.sessionId },
        data: {
          status: 'FAILED',
          errorMessage: 'Plan blocked by policy engine',
          metadata: { cognitiveOutcome: earlyOutcome as any } as any,
        },
      });

      this.eventBus.emit(ctx.sessionId, 'execution:failed', {
        reason: 'policy',
        message: 'Plan violates safety policies',
        blockedSteps: policyCheck.blockedSteps,
        cognitiveOutcome: earlyOutcome,
      });

      ctx.failureReason = `Policy block: ${policyReason}`;
      ctx.completedSuccessfully = false;
      ctx.exitReason = PipelineExitReason.POLICY_FAILED;
    }
  }
}
