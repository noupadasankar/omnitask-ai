import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { MemoryType } from '@prisma/client';

export interface WorkflowStep {
  order: number;
  description: string;
  agentType?: string;
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  triggerPattern: string;
  steps: WorkflowStep[];
  successRate: number;
  totalRuns: number;
  averageDuration: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSuggestion {
  workflowId: string;
  name: string;
  matchScore: number;
  steps: WorkflowStep[];
  expectedSuccessRate: number;
}

@Injectable()
export class ProceduralMemoryService {
  private readonly logger = new Logger(ProceduralMemoryService.name);

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
  ) {}

  async extractWorkflow(
    userId: string,
    name: string,
    triggerPattern: string,
    steps: WorkflowStep[],
    tags: string[] = [],
  ): Promise<Workflow> {
    const workflow: Workflow = {
      id: '',
      userId,
      name,
      triggerPattern,
      steps,
      successRate: 0,
      totalRuns: 0,
      averageDuration: 0,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const memory = await this.memoryService.store(
      userId,
      JSON.stringify(workflow),
      'PROCEDURAL' as MemoryType,
      {
        summary: `Workflow: ${name} — ${triggerPattern.substring(0, 80)}`,
        importance: 0.7,
        metadata: {
          workflowName: name,
          triggerPattern,
          stepCount: steps.length,
          tags,
          isWorkflow: true,
        },
      },
    );

    workflow.id = memory.id;
    await this.prisma.memory.update({
      where: { id: memory.id },
      data: { content: JSON.stringify(workflow) },
    });

    this.logger.debug(`Extracted workflow "${name}" (${steps.length} steps)`);
    return workflow;
  }

  async suggestWorkflow(userId: string, goal: string): Promise<WorkflowSuggestion | null> {
    const workflows = await this.listWorkflows(userId);
    if (workflows.length === 0) return null;

    const normalizedGoal = goal.toLowerCase();
    const scored = workflows
      .map((w) => {
        const pattern = w.triggerPattern.toLowerCase();
        let matchScore = 0;

        const goalTokens = new Set(normalizedGoal.split(/\s+/).filter((t) => t.length > 3));
        const patternTokens = pattern.split(/\s+/);

        for (const token of patternTokens) {
          if (goalTokens.has(token)) matchScore += 0.15;
        }

        if (normalizedGoal.includes(pattern)) matchScore += 0.5;
        if (pattern.includes(normalizedGoal)) matchScore += 0.3;

        for (const tag of w.tags) {
          if (normalizedGoal.includes(tag.toLowerCase())) matchScore += 0.1;
        }

        return { workflow: w, matchScore };
      })
      .filter((s) => s.matchScore > 0.2)
      .sort((a, b) => b.matchScore - a.matchScore);

    if (scored.length === 0) return null;

    const best = scored[0];
    return {
      workflowId: best.workflow.id,
      name: best.workflow.name,
      matchScore: Math.min(best.matchScore, 1),
      steps: best.workflow.steps,
      expectedSuccessRate: best.workflow.successRate,
    };
  }

  async recordOutcome(
    workflowId: string,
    success: boolean,
    duration: number,
  ): Promise<Workflow> {
    const memory = await this.prisma.memory.findUnique({ where: { id: workflowId } });
    if (!memory || memory.type !== ('PROCEDURAL' as MemoryType)) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const workflow = this.parseWorkflow(memory.content, workflowId);
    const n = workflow.totalRuns + 1;
    workflow.successRate = ((workflow.successRate * workflow.totalRuns) + (success ? 1 : 0)) / n;
    workflow.averageDuration = ((workflow.averageDuration * workflow.totalRuns) + duration) / n;
    workflow.totalRuns = n;
    workflow.updatedAt = new Date().toISOString();

    const newImportance = Math.min(0.95, 0.5 + (workflow.successRate * 0.45));
    await this.prisma.memory.update({
      where: { id: workflowId },
      data: {
        content: JSON.stringify(workflow),
        importance: newImportance,
      },
    });

    return workflow;
  }

  async listWorkflows(
    userId: string,
    tags?: string[],
    minSuccessRate?: number,
  ): Promise<Workflow[]> {
    const where: any = {
      userId,
      type: 'PROCEDURAL' as MemoryType,
      deletedAt: null,
      metadata: { path: ['isWorkflow'], equals: true },
    };

    const memories = await this.prisma.memory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    let workflows = memories.map((m) => this.parseWorkflow(m.content, m.id));

    if (tags && tags.length > 0) {
      const tagSet = new Set(tags.map((t) => t.toLowerCase()));
      workflows = workflows.filter((w) => w.tags.some((t) => tagSet.has(t.toLowerCase())));
    }

    if (minSuccessRate !== undefined) {
      workflows = workflows.filter((w) => w.successRate >= minSuccessRate);
    }

    return workflows;
  }

  async getWorkflow(workflowId: string): Promise<Workflow> {
    const memory = await this.prisma.memory.findUnique({ where: { id: workflowId } });
    if (!memory || memory.type !== ('PROCEDURAL' as MemoryType)) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    return this.parseWorkflow(memory.content, workflowId);
  }

  private parseWorkflow(content: string, id: string): Workflow {
    try {
      const parsed = JSON.parse(content);
      return {
        id: parsed.id || id,
        userId: parsed.userId || '',
        name: parsed.name || 'Unnamed Workflow',
        triggerPattern: parsed.triggerPattern || '',
        steps: parsed.steps || [],
        successRate: parsed.successRate ?? 0,
        totalRuns: parsed.totalRuns ?? 0,
        averageDuration: parsed.averageDuration ?? 0,
        tags: parsed.tags || [],
        createdAt: parsed.createdAt || new Date().toISOString(),
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    } catch {
      return {
        id,
        userId: '',
        name: 'Unnamed Workflow',
        triggerPattern: '',
        steps: [],
        successRate: 0,
        totalRuns: 0,
        averageDuration: 0,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }
}
