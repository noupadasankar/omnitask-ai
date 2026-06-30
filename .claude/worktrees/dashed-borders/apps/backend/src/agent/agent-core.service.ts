import { Injectable, Logger } from '@nestjs/common';
import { AgentService } from './agent.service';
import { CriticService } from './critic.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryType } from '@prisma/client';

export interface AgentCycleResult {
  plan: { goal: string; steps: unknown[] };
  executionResults: unknown[];
  critique: { passed: boolean; feedback: string; score: number };
}

/** Planner → Executor → Critic → Memory */
@Injectable()
export class AgentCoreService {
  private readonly logger = new Logger(AgentCoreService.name);

  constructor(
    private readonly executor: AgentService,
    private readonly critic: CriticService,
    private readonly memory: MemoryService,
  ) {}

  async runCycle(
    executionId: string,
    steps: unknown[],
    context: { userId: string; taskId: string; goal: string },
  ): Promise<AgentCycleResult> {
    const plan = { goal: context.goal, steps };

    await this.memory.store(
      context.userId,
      `Working: ${context.goal}`,
      MemoryType.WORKING,
      { taskId: context.taskId, summary: context.goal.slice(0, 120) },
    );

    this.logger.log(`Executor: ${steps.length} steps`);
    await this.executor.runAgentLoop(executionId, steps, context.userId);

    const executionResults = await this.executor.getStepResults(executionId);
    const critique = await this.critic.evaluate(plan, executionResults);

    if (!critique.passed) {
      this.logger.warn(`Critic rejected: ${critique.feedback}`);
    } else {
      await this.memory.store(
        context.userId,
        `Success: ${context.goal}`,
        MemoryType.EPISODIC,
        {
          taskId: context.taskId,
          summary: critique.feedback,
          metadata: { score: critique.score },
        },
      );

      await this.memory.store(
        context.userId,
        `Pattern: ${JSON.stringify(steps).slice(0, 500)}`,
        MemoryType.SEMANTIC,
        { taskId: context.taskId, summary: 'Successful plan pattern' },
      );
    }

    return { plan, executionResults, critique };
  }
}
