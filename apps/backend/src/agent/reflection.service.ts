import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL_MINI } from '../common/llm-config';
import { ParsedGoal } from './goal-understanding.service';
import { AgentPlan, PlannedStep } from '../shared/interfaces/agent.interfaces';
import { StepResult } from './critic.service';
import { MemoryStoreService } from './memory-store.service';

export interface SelfReflection {
  didSucceed: boolean;
  mismatchedAssumptions: {
    stage: string;
    expectedState: string;
    actualState: string;
    reasonForMismatch: string;
  }[];
  optimalPathDiscovered: string | null;
  failedSelectors: string[];
  recommendedPromptCorrection: string;
}

@Injectable()
export class ReflectionService {
  private readonly logger = new Logger(ReflectionService.name);

  constructor(
    private readonly llm: LlmService,
    private memoryStore: MemoryStoreService,
  ) {}

  /**
   * Triggers non-blocking, asynchronous post-run debrief reflection.
   */
  async reflect(
    sessionId: string,
    userId: string,
    goal: string,
    parsedGoal: ParsedGoal,
    plan: AgentPlan,
    results: StepResult[],
    errorHistory: string[],
    didSucceed: boolean,
  ): Promise<void> {
    setImmediate(async () => {
      this.logger.log(`Post-Run Reflection queued for session ${sessionId}`);
      try {
        const reflection = await this.generateReflection(goal, parsedGoal, plan, results, errorHistory, didSucceed);
        await this.storeReflectionInsights(userId, parsedGoal, reflection);
      } catch (error: any) {
        this.logger.error(`Reflection cycle failed for session ${sessionId}: ${error.message}`);
      }
    });
  }

  private async generateReflection(
    goal: string,
    parsedGoal: ParsedGoal,
    plan: AgentPlan,
    results: StepResult[],
    errorHistory: string[],
    didSucceed: boolean,
  ): Promise<SelfReflection> {
    const stepsTrace = plan.steps
      .map((s: PlannedStep, idx: number) => {
        const res = results[idx];
        const resStatus = res ? (res.success ? '✓ Success' : `✗ Failed: ${res.error || 'Unknown'}`) : 'Not Executed';
        return `Step ${s.index} [${s.action}]: ${s.description} -> Result: ${resStatus}`;
      })
      .join('\n');

    const prompt = `Perform an asynchronous post-execution reflection on the autonomous agent execution.
Define what assumptions were incorrect, what selectors failed, and if any optimal shortcuts or prompt overrides were identified.

ORIGINAL USER GOAL: "${goal}"
TASK TYPE: ${parsedGoal?.taskType || 'general'}
SUCCESS STATUS: ${didSucceed ? 'SUCCESSFUL' : 'FAILED'}

EXECUTION TRACE:
${stepsTrace}

ERROR LOGS:
${errorHistory.length > 0 ? errorHistory.join('\n') : 'None'}

Output a strict JSON reflection matching this schema:
{
  "didSucceed": boolean,
  "mismatchedAssumptions": [
    {
      "stage": "string",
      "expectedState": "What we expected to see",
      "actualState": "What was actually on the screen",
      "reasonForMismatch": "Why it differed"
    }
  ],
  "optimalPathDiscovered": "Optional description of a shortcut (e.g. 'direct URL parameters manipulation instead of 3 clicks'), or null",
  "failedSelectors": ["List of any HTML element selectors or target attributes that failed or timed out"],
  "recommendedPromptCorrection": "A short instruction for the planner on how to avoid this issue next time"
}`;

    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL_MINI, // Cheaper model for metadata summaries
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty reflection response');

      return JSON.parse(content) as SelfReflection;
    } catch (error: any) {
      this.logger.error(`Failed to generate reflection: ${error.message}`);
      return {
        didSucceed,
        mismatchedAssumptions: [],
        optimalPathDiscovered: null,
        failedSelectors: [],
        recommendedPromptCorrection: '',
      };
    }
  }

  private async storeReflectionInsights(
    userId: string,
    parsedGoal: ParsedGoal,
    reflection: SelfReflection,
  ): Promise<void> {
    const taskType = parsedGoal?.taskType || 'general';
    const domain = parsedGoal?.preferredWebsites?.[0] || 'general';

    // 1. Store negative invariants for failed selectors
    for (const selector of reflection.failedSelectors) {
      try {
        const key = `negative_invariant:${taskType}:${domain}:${Date.now()}`;
        const content = JSON.stringify({
          taskType,
          domain,
          failedSelector: selector,
          warning: `Avoid using selector "${selector}" on ${domain} for ${taskType} tasks as it has historically failed.`,
        });

        await this.memoryStore.store(
          userId,
          'SEMANTIC',
          key,
          content,
          0.6,
          undefined,
          {
            strategyType: 'negative_invariant',
            failedSelector: selector,
            domain,
            taskType,
          },
        );
        this.logger.log(`Negative invariant memory stored for selector: "${selector}"`);
      } catch (err: any) {
        this.logger.error(`Failed to save negative invariant: ${err.message}`);
      }
    }

    // 2. Save optimal path discovered as a semantic tip
    if (reflection.didSucceed && reflection.optimalPathDiscovered) {
      try {
        await this.memoryStore.store(
          userId,
          'SEMANTIC',
          `optimal_shortcut:${taskType}:${Date.now()}`,
          JSON.stringify({
            taskType,
            domain,
            tip: reflection.optimalPathDiscovered,
            promptOverride: reflection.recommendedPromptCorrection,
          }),
          0.75,
          undefined,
          {
            strategyType: 'optimal_shortcut',
            domain,
            taskType,
          },
        );
        this.logger.log(`Optimal shortcut memory stored: "${reflection.optimalPathDiscovered.substring(0, 50)}..."`);
      } catch (err: any) {
        this.logger.error(`Failed to save optimal shortcut memory: ${err.message}`);
      }
    }
  }

}
