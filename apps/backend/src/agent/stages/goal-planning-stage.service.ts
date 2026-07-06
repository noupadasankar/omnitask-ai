<<<<<<< HEAD
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
=======
import { Injectable, Logger } from '@nestjs/common';
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
import { PlanOrchestratorService } from '../runtime/plan-orchestrator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionManagerService } from '../runtime/session-manager.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';

@Injectable()
export class GoalPlanningStage implements IExecutionStage {
  private readonly logger = new Logger(GoalPlanningStage.name);

  constructor(
    private readonly planOrchestrator: PlanOrchestratorService,
    private readonly prisma: PrismaService,
<<<<<<< HEAD
    @Inject(forwardRef(() => SessionManagerService))
=======
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
    private readonly sessionManager: SessionManagerService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    const session = await this.prisma.executionSession.findUnique({ where: { id: ctx.sessionId } });
    if (!session) {
      this.logger.error(`Session not found: ${ctx.sessionId}`);
      return;
    }

    ctx.userId = session.userId;
    ctx.taskId = session.taskId;

    const routed = await this.planOrchestrator.buildExecutionPlan(
      ctx.sessionId,
      session.userId,
      session.taskId,
      ctx.goal,
      ctx.parsedGoal,
      ctx.config,
    );

    ctx.plan = routed.merged.plan;
    ctx.executionGraph = routed.merged.graph;
    ctx.totalSteps = ctx.plan.steps.length;
    ctx.routedDomain = routed.domain;
    ctx.planBuilt = true;

    await this.prisma.executionSession.update({
      where: { id: ctx.sessionId },
      data: {
        plan: ctx.plan as any,
        totalSteps: ctx.totalSteps,
        metadata: {
          ...((session.metadata as Record<string, any>) || {}),
          parsedGoal: ctx.parsedGoal || null,
          routedDomain: routed.domain,
          matchedSkills: routed.matchedSkills,
          preferredSitesApplied: routed.preferredSitesApplied || [],
        } as any,
      },
    });

    this.eventBus.emit(ctx.sessionId, 'plan:created', { plan: ctx.plan });
    this.sessionManager.setGateState(ctx.sessionId, 'PLAN_READY');
  }
}
