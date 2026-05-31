import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AgentPlan, PlannedStep } from '../shared/interfaces/agent.interfaces';

export interface ReplanResult {
  steps: PlannedStep[];
  confidence: number;
  reasoning: string;
  actionRequired: 'autonomous' | 'verify' | 'user_confirmation';
}

@Injectable()
export class ReplanningService {
  private readonly logger = new Logger(ReplanningService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async replan(
    originalPlan: AgentPlan,
    failedStepIndex: number,
    error: string,
    screenshotBase64?: string,
    simplifiedDOM?: any,
  ): Promise<ReplanResult> {
    this.logger.log(`ReplanningEngine evaluating failed step ${failedStepIndex}: "${error}"`);

    const completedSteps = originalPlan.steps.slice(0, failedStepIndex);
    const failedStep = originalPlan.steps[failedStepIndex];

    const systemPrompt = `You are a self-healing browser automation replanner. A previous action failed.
Your task is to analyze:
1. The original goal.
2. Completed roadmap actions.
3. The failed step.
4. The error description.
5. The simplified DOM interactable elements.

Generate a corrective set of planned steps starting at index ${failedStepIndex}.
Also, calculate a confidence score (0.0 to 1.0) indicating how confident you are in this replan:
- If confidence >= 0.9: Action will execute autonomously.
- If confidence is between 0.7 and 0.9: Action will execute but be checked strictly.
- If confidence < 0.7: User verification is required.

Output format strictly as JSON matching this schema:
{
  "steps": [
    {
      "index": number,
      "action": "navigate | click | type | select | scroll | hover | press_key | wait",
      "target": "CSS selector",
      "value": "type value if any",
      "description": "Short explanation",
      "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
      "requiresApproval": boolean
    }
  ],
  "confidence": number,
  "reasoning": "Reason for the failure and chosen correction path"
}`;

    const userPrompt = `
GOAL: "${originalPlan.goal}"
FAILED ACTION: "${failedStep?.description}"
ERROR: "${error}"
SIMPLIFIED INTERACTIVE DOM ELEMENTS:
${JSON.stringify(simplifiedDOM || {}, null, 2)}
`;

    try {
      const messages: any[] = [{ role: 'system', content: systemPrompt }];

      if (screenshotBase64) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
            },
          ],
        });
      } else {
        messages.push({ role: 'user', content: userPrompt });
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from GPT-4o replanner');

      const parsed = JSON.parse(content);
      const confidence = parsed.confidence ?? 0.5;

      let actionRequired: ReplanResult['actionRequired'] = 'user_confirmation';
      if (confidence >= 0.9) actionRequired = 'autonomous';
      else if (confidence >= 0.7) actionRequired = 'verify';

      this.logger.log(`Replan constructed successfully. Confidence score: ${confidence}. Action required: ${actionRequired}`);

      return {
        steps: this.validateSteps(parsed.steps || [], failedStepIndex),
        confidence,
        reasoning: parsed.reasoning || 'Self-healed re-routing.',
        actionRequired,
      };
    } catch (error: any) {
      this.logger.error(`Self-healing replan failed: ${error.message}`);
      return {
        steps: [],
        confidence: 0,
        reasoning: `Replanner failure: ${error.message}`,
        actionRequired: 'user_confirmation',
      };
    }
  }

  private validateSteps(steps: any[], startIndex: number): PlannedStep[] {
    return steps.map((step, i) => ({
      index: startIndex + i,
      action: step.action || 'wait',
      target: step.target || undefined,
      value: step.value || undefined,
      description: step.description || `Step ${startIndex + i}`,
      riskLevel: step.riskLevel || 'LOW',
      requiresApproval: step.requiresApproval || false,
    }));
  }
}
