// backend/src/agent/critic.service.ts
//
// Full LLM-powered rewrite of the CriticService.
// Original: counted step.success !== false — a stub.
// New: GPT-4o critique against original user intent, returns actionable feedback
// and quality-ranked suggestions stored as semantic memory.

import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL } from '../common/llm-config';

export interface StepResult {
  success: boolean;
  error?: string;
}

/** Minimal plan shape the critic needs to render its evaluation prompt.
 *  Steps cross a serialization (BullMQ job) boundary, so they arrive as
 *  `unknown[]` and are narrowed defensively where consumed. */
export interface CriticEvaluationInput {
  goal: string;
  steps: unknown[];
}

export interface CritiqueResult {
  passed: boolean;
  score: number;           // 0–100
  feedback: string;        // Human-readable verdict
  suggestions: string[];   // Specific improvements for next attempt
  qualityDimensions: {
    accuracy: number;       // Did it do the right thing?
    completeness: number;   // Did it finish what it started?
    efficiency: number;     // Did it do it without waste?
    safety: number;         // Did it avoid risky actions?
  };
}

@Injectable()
export class CriticService {
  private readonly logger = new Logger(CriticService.name);

  constructor(private readonly llm: LlmService) {}

  async evaluate(
    plan: CriticEvaluationInput,
    results: StepResult[],
  ): Promise<CritiqueResult> {
    this.logger.log(`CriticService evaluating execution for goal: "${plan.goal}"`);

    const completedCount = results.filter(r => r.success !== false).length;
    const totalSteps = plan.steps?.length ?? 0;
    const completionRate = totalSteps > 0 ? completedCount / totalSteps : 1;

    try {
      const systemPrompt = `You are a senior AI execution quality critic. Your job is to evaluate how well an autonomous agent executed a user's goal.

Evaluate across 4 dimensions (0-100 each):
1. Accuracy: Did the agent do what was actually asked?
2. Completeness: Did the agent finish all necessary work?
3. Efficiency: Were steps concise and focused (no waste)?
4. Safety: Did the agent avoid risky or destructive actions?

Overall score = weighted average: accuracy(40%) + completeness(30%) + efficiency(15%) + safety(15%)

Score thresholds:
- >= 85: Excellent execution
- 70-84: Good, passed
- 50-69: Partial success, needs review
- < 50: Failed, requires replanning

Output strict JSON only:
{
  "passed": boolean,
  "score": 0-100,
  "feedback": "One paragraph verdict",
  "suggestions": ["Up to 3 specific, actionable improvements"],
  "qualityDimensions": {
    "accuracy": 0-100,
    "completeness": 0-100,
    "efficiency": 0-100,
    "safety": 0-100
  }
}`;

      const userPrompt = `GOAL: "${plan.goal}"

EXECUTION PLAN (${totalSteps} steps):
${plan.steps.map((step, i) => {
  const s = (step ?? {}) as { action?: string; description?: string; riskLevel?: string };
  return `  ${i + 1}. [${s.action ?? 'action'}] ${s.description || s.action || 'step'} (risk: ${s.riskLevel || 'LOW'})`;
}).join('\n')}

RESULTS SUMMARY:
- Total Steps: ${totalSteps}
- Completed: ${completedCount} (${Math.round(completionRate * 100)}%)
- Failed: ${totalSteps - completedCount}

Step Outcomes:
${results.map((r, i) => {
  const success = r.success !== false;
  return `  Step ${i + 1}: ${success ? '✓ Success' : '✗ Failed'}${r.error ? ` — ${r.error}` : ''}`;
}).join('\n')}`;

      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from CriticService LLM');

      const result = JSON.parse(content) as CritiqueResult;
      result.score = Math.max(0, Math.min(100, result.score));
      result.passed = result.score >= 70;

      this.logger.log(
        `Critique complete — Score: ${result.score}/100, passed: ${result.passed}`
      );

      return result;
    } catch (error: any) {
      this.logger.error(`CriticService LLM evaluation failed: ${error.message}. Using fallback.`);
      return this.buildFallbackCritique(completionRate, totalSteps, completedCount);
    }
  }

  private buildFallbackCritique(
    completionRate: number,
    totalSteps: number,
    completedCount: number,
  ): CritiqueResult {
    const score = Math.round(completionRate * 100);
    const passed = score >= 70;
    return {
      passed,
      score,
      feedback: passed
        ? `Execution met quality bar: ${completedCount}/${totalSteps} steps completed (${score}%). LLM critique unavailable.`
        : `Execution below threshold: ${completedCount}/${totalSteps} steps (${score}%). Consider re-planning.`,
      suggestions: [
        'Review failed steps for error patterns',
        'Consider adjusting selector strategy for failed clicks',
        'Add more wait conditions between navigation steps',
      ],
      qualityDimensions: {
        accuracy: score,
        completeness: score,
        efficiency: 70,
        safety: 95,
      },
    };
  }
}
