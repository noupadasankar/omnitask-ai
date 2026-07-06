import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';
import { z } from 'zod';
import { AiPlannerService } from './ai-planner.service';
import { TaskStatus } from '@prisma/client';

const PlanStepSchema = z.object({
  id: z.string(),
  type: z.string(),
  action: z.string(),
  description: z.string(),
  input: z.any(),
});

const FullPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(PlanStepSchema),
});

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiPlanner: AiPlannerService,
  ) {}

  /**
   * Lifecycle segment: QUEUED/PLANNING → PLANNED (plan persisted).
   */
  async generatePlan(naturalLanguage: string, userId: string) {
    this.logger.log(`Planning: ${naturalLanguage.slice(0, 80)}`);

    const planHash = this.hashPlan(naturalLanguage);

    const existingTask = await this.prisma.task.findFirst({
      where: { planHash, userId, status: TaskStatus.PLANNED },
      include: { plan: true },
    });

    if (existingTask?.plan) {
      this.logger.log('Reusing cached plan for identical prompt');
      return existingTask;
    }

    const task = await this.prisma.task.create({
      data: {
        userId,
        title: naturalLanguage.substring(0, 100),
        naturalLanguage,
        status: TaskStatus.PLANNING,
        priority: 'MEDIUM',
        planHash,
      },
    });

    try {
      const rawPlan = await this.aiPlanner.createPlan(naturalLanguage);
      const validatedPlan = FullPlanSchema.parse(rawPlan);

      await this.prisma.plan.create({
        data: {
          taskId: task.id,
          hash: planHash,
          rawOutput: JSON.stringify(validatedPlan),
          steps: validatedPlan.steps,
          model: 'ai-planner-v1',
          tokensUsed: 0,
          validated: true,
        },
      });

      return this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.PLANNED,
          context: validatedPlan,
        },
        include: { plan: true },
      });
    } catch (error) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Planning failed',
        },
      });
      throw error;
    }
  }

  private hashPlan(input: string): string {
    return createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
  }
}
