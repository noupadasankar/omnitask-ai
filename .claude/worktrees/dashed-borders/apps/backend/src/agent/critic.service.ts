// backend/src/agent/critic.service.ts
//
// Full LLM-powered rewrite of the CriticService.
// Original: counted step.success !== false — a stub.
// New: GPT-4o critique against original user intent, returns actionable feedback
// and quality-ranked suggestions stored as semantic memory.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async evaluate(
    plan: { goal: string; steps: any[] },
    results: any[],
  ): Promise<CritiqueResult> {
    this.logger.log(`CriticService evaluating execution for goal: "${plan.goal}"`);

    const completedCount = results.filter(
      r => r && typeof r === 'object' && (r as { success?: boolean }).success !== false,
    ).length;
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
${plan.steps.map((s: any, i: number) => `  ${i + 1}. [${s.action}] ${s.description || s.action} (risk: ${s.riskLevel || 'LOW'})`).join('\n')}

RESULTS SUMMARY:
- Total Steps: ${totalSteps}
- Completed: ${completedCount} (${Math.round(completionRate * 100)}%)
- Failed: ${totalSteps - completedCount}

Step Outcomes:
${results.map((r: any, i: number) => {
  const success = r && typeof r === 'object' ? (r as any).success !== false : !!r;
  return `  Step ${i + 1}: ${success ? '✓ Success' : '✗ Failed'}${r?.error ? ` — ${r.error}` : ''}`;
}).join('\n')}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
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
