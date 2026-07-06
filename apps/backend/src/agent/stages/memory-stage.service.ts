import { Injectable } from '@nestjs/common';
import { MemoryService } from '../../memory/memory.service';
import { StrategyMemoryService } from '../strategy-memory.service';
import { PreferenceMemoryService } from '../../memory/preferences/preference-memory.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';
import { MemoryType } from '@prisma/client';

@Injectable()
export class MemoryStage implements IExecutionStage {
  constructor(
    private readonly memory: MemoryService,
    private readonly strategyMemory: StrategyMemoryService,
    private readonly preferenceMemory: PreferenceMemoryService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    if (!ctx.userId) return;

    if (ctx.completedSuccessfully && ctx.plan) {
      const stepsSummary = ctx.plan.steps.map((s) => `${s.action}(${s.target})`).join(' → ');
      await this.memory.store(
        ctx.userId,
        `Success: ${ctx.goal}`,
        MemoryType.EPISODIC,
        { taskId: ctx.taskId ?? undefined, summary: stepsSummary, metadata: { duration: ctx.durationMs } },
      );

      if (ctx.parsedGoal) {
        await this.strategyMemory.storeSuccessfulStrategy(
          ctx.userId,
          ctx.goal,
          ctx.parsedGoal,
          ctx.plan,
          ctx.durationMs,
        );

        this.eventBus.emit(ctx.sessionId, 'execution:event', {
          type: 'log:info',
          data: { source: 'StrategyMemory', message: 'Strategy pattern saved for future task recall' },
        });

        const categoryMap: Record<string, string> = {
          job_search: 'job', food_order: 'food', shopping: 'shopping',
          price_comparison: 'shopping', ticket_booking: 'travel',
          hotel_booking: 'travel', flight_search: 'travel',
        };

        const category = categoryMap[ctx.parsedGoal.taskType as string] || ctx.routedDomain || 'general';
        const pluginIds = (ctx.plan?.skillsUsed || []).filter((id: string) => id.includes('-'));
        if (pluginIds.length > 0) {
          for (const pluginId of pluginIds) {
            await this.preferenceMemory.autoLearn(ctx.userId, category, pluginId);
          }
          const updatedPrefs = await this.preferenceMemory.getPreferences(ctx.userId);
          this.eventBus.emit(ctx.sessionId, 'memory:preferences_updated', {
            sessionId: ctx.sessionId,
            preferences: updatedPrefs,
            learnedFrom: pluginIds,
          });
        }
      }
    } else if (ctx.parsedGoal && ctx.errorHistory.length > 0) {
      await this.strategyMemory.storeFailurePattern(
        ctx.userId,
        ctx.goal,
        ctx.parsedGoal,
        ctx.errorHistory,
        ctx.stepsCompleted,
      );
    }
  }
}
