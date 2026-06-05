// backend/src/agent/strategy-memory.service.ts
//
// StrategyMemoryService is what makes OmniTask AI learn across sessions.
// After every successful execution, it extracts and stores the strategy pattern.
// Before planning, it retrieves matching strategies and injects them into
// the planner's context — giving the planner the benefit of past experience.
//
// This is the difference between an agent that starts fresh every time
// and one that genuinely gets smarter with each task it runs.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';
import { ParsedGoal } from './goal-understanding.service';

export interface StrategyPattern {
  goalType: string;
  domain: string;
  effectiveApproach: string;
  effectiveSites: string[];
  sitesToAvoid: string[];
  avgSteps: number;
  skillsUsed: string[];
  successRate: number;
  notes: string;
}

export interface RecalledStrategy {
  pattern: StrategyPattern;
  relevanceScore: number; // 0.0-1.0
  memoryKey: string;
}

@Injectable()
export class StrategyMemoryService {
  private readonly logger = new Logger(StrategyMemoryService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * After a successful execution, extract and store the strategy pattern.
   * Called by ExecutionEngineService at the end of a successful run.
   */
  async storeSuccessfulStrategy(
    userId: string,
    goal: string,
    parsedGoal: ParsedGoal,
    plan: AgentPlan,
    durationMs: number,
  ): Promise<void> {
    this.logger.log(`Extracting strategy pattern from successful execution: "${goal}"`);

    try {
      const pattern = await this.extractPattern(goal, parsedGoal, plan, durationMs);

      const embedding = await this.generateEmbedding(
        `${parsedGoal.taskType} ${parsedGoal.intent} ${pattern.domain} ${pattern.effectiveApproach}`
      );

      const key = `strategy:${parsedGoal.taskType}:${Date.now()}`;

      // Epistemic Guard: Count how many times we've successfully stored this goal type strategy
      const existingCount = await this.prisma.agentMemory.count({
        where: {
          userId,
          type: 'SEMANTIC',
          metadata: {
            path: ['goalType'],
            equals: parsedGoal.taskType,
          },
        },
      });

      // Scale importance: candidate strategies (less than 2 runs) get 0.50, promoted strategies get 0.85
      const isCandidate = existingCount < 2;
      const importance = isCandidate ? 0.50 : 0.85;

      await this.prisma.agentMemory.create({
        data: {
          userId,
          type: 'SEMANTIC',
          key,
          content: JSON.stringify(pattern),
          embedding,
          importance,
          metadata: {
            strategyType: 'execution_pattern',
            goalType: parsedGoal.taskType,
            domain: pattern.domain,
            successRate: pattern.successRate,
            isCandidate,
          },
        },
      });

      this.logger.log(`Strategy pattern stored: ${key} (Status: ${isCandidate ? 'CANDIDATE' : 'PROMOTED'}, Importance: ${importance})`);
    } catch (error: any) {
      this.logger.error(`Failed to store strategy: ${error.message}`);
    }
  }

  /**
   * Store a failure pattern so the planner can avoid known bad approaches.
   */
  async storeFailurePattern(
    userId: string,
    goal: string,
    parsedGoal: ParsedGoal,
    errorHistory: string[],
    stepsAttempted: number,
  ): Promise<void> {
    if (errorHistory.length === 0) return;

    try {
      const failureContent = JSON.stringify({
        goalType: parsedGoal.taskType,
        domain: parsedGoal.entities?.['domain'] || 'general',
        failureReasons: errorHistory.slice(-3),
        stepsAttempted,
        sitesUsed: parsedGoal.preferredWebsites,
        recommendation: `Avoid this approach for "${parsedGoal.taskType}" tasks. Consider alternative sites or methods.`,
      });

      const embedding = await this.generateEmbedding(
        `failure ${parsedGoal.taskType} ${parsedGoal.intent}`
      );

      await this.prisma.agentMemory.create({
        data: {
          userId,
          type: 'SEMANTIC',
          key: `failure:${parsedGoal.taskType}:${Date.now()}`,
          content: failureContent,
          embedding,
          importance: 0.7,
          metadata: { strategyType: 'failure_pattern', goalType: parsedGoal.taskType },
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to store failure pattern: ${error.message}`);
    }
  }

  /**
   * Recall top matching strategies for a given goal.
   * Returns an array of strategies ranked by relevance, to be injected into planner context.
   */
  async recallStrategies(
    userId: string,
    parsedGoal: ParsedGoal,
    limit = 3,
  ): Promise<RecalledStrategy[]> {
    this.logger.debug(`Recalling strategies for goalType: "${parsedGoal.taskType}"`);

    try {
      const queryText = `${parsedGoal.taskType} ${parsedGoal.intent} ${parsedGoal.entities ? JSON.stringify(parsedGoal.entities) : ''}`;
      const queryEmbedding = await this.generateEmbedding(queryText);

      const memories = await this.prisma.agentMemory.findMany({
        where: {
          userId,
          type: 'SEMANTIC',
          metadata: { path: ['strategyType'], string_contains: 'execution_pattern' },
        },
        orderBy: { importance: 'desc' },
        take: limit * 4, // Fetch more than needed, then rank by similarity
      });

      const scored = memories.map((m: any) => {
        const similarity = this.cosineSimilarity(
          queryEmbedding,
          (m.embedding as any) || [],
        );
        return { memory: m, similarity };
      });

      const top = scored
        .filter(s => s.similarity > 0.5)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      const recalled: RecalledStrategy[] = [];
      for (const { memory, similarity } of top) {
        try {
          const pattern = JSON.parse(memory.content) as StrategyPattern;
          recalled.push({
            pattern,
            relevanceScore: similarity,
            memoryKey: memory.key,
          });
          // Update access metadata
          await this.prisma.agentMemory.update({
            where: { id: memory.id },
            data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
          });
        } catch {
          // Skip malformed memory entries
        }
      }

      this.logger.log(
        `Recalled ${recalled.length} strategies for "${parsedGoal.taskType}" (top relevance: ${recalled[0]?.relevanceScore.toFixed(2) || 'none'})`
      );

      return recalled;
    } catch (error: any) {
      this.logger.error(`Strategy recall failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Format recalled strategies into a planner-readable context string.
   * This is injected directly into the planner's system prompt.
   */
  formatStrategiesForPlanner(strategies: RecalledStrategy[]): string {
    if (strategies.length === 0) return '';

    return `
RECALLED EXECUTION STRATEGIES (from past successful runs):
${strategies.map((s, i) => `
Strategy ${i + 1} (relevance: ${Math.round(s.relevanceScore * 100)}%):
- Goal Type: ${s.pattern.goalType}
- Effective Approach: ${s.pattern.effectiveApproach}
- Sites That Work: ${s.pattern.effectiveSites.join(', ') || 'None recorded'}
- Sites To Avoid: ${s.pattern.sitesToAvoid.join(', ') || 'None'}
- Typical Step Count: ${s.pattern.avgSteps}
- Skills Used: ${s.pattern.skillsUsed.join(', ')}
- Notes: ${s.pattern.notes}
`).join('\n')}

INSTRUCTION: Use the above strategies as guidance when building your plan. Prefer sites and approaches that have historically succeeded.
`;
  }

  private async extractPattern(
    goal: string,
    parsedGoal: ParsedGoal,
    plan: AgentPlan,
    durationMs: number,
  ): Promise<StrategyPattern> {
    const prompt = `Extract a reusable strategy pattern from this successful AI agent execution.

GOAL: "${goal}"
TASK TYPE: ${parsedGoal.taskType}
INTENT: ${parsedGoal.intent}
WEBSITES USED: ${parsedGoal.preferredWebsites.join(', ') || 'None specified'}
SKILLS USED: ${plan.skillsUsed?.join(', ') || 'None'}
STEP COUNT: ${plan.steps.length}
DURATION: ${Math.round(durationMs / 1000)}s

Output a JSON strategy pattern:
{
  "goalType": "${parsedGoal.taskType}",
  "domain": "brief domain/category (e.g. 'e-commerce', 'news', 'job search')",
  "effectiveApproach": "One sentence describing what worked well",
  "effectiveSites": ["sites that worked"],
  "sitesToAvoid": ["sites known to have issues"],
  "avgSteps": ${plan.steps.length},
  "skillsUsed": ${JSON.stringify(plan.skillsUsed || [])},
  "successRate": 1.0,
  "notes": "Any specific tips for future similar tasks"
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Cheaper model for pattern extraction
        messages: [
          { role: 'system', content: 'Extract execution strategy patterns from AI agent runs. Output valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty pattern extraction response');

      return JSON.parse(content) as StrategyPattern;
    } catch {
      // Fallback: build pattern from available data without LLM
      return {
        goalType: parsedGoal.taskType,
        domain: 'general',
        effectiveApproach: `Used ${plan.skillsUsed?.join(', ') || 'default browser actions'} to complete ${parsedGoal.taskType} task`,
        effectiveSites: parsedGoal.preferredWebsites,
        sitesToAvoid: [],
        avgSteps: plan.steps.length,
        skillsUsed: plan.skillsUsed || [],
        successRate: 1.0,
        notes: `Completed in ${Math.round(durationMs / 1000)}s`,
      };
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 2000), // Truncate for safety
    });
    return response.data[0]?.embedding || [];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (!magA || !magB) return 0;
    return dot / (magA * magB);
  }
}
