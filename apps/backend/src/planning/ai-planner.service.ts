import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL_MINI } from '../common/llm-config';

@Injectable()
export class AiPlannerService {
  private readonly logger = new Logger(AiPlannerService.name);

  constructor(private readonly llm: LlmService) {}

  async createPlan(naturalLanguage: string) {
    this.logger.log(`AI planning for: ${naturalLanguage}`);

    try {
      const prompt = `You are an AI task planner. Break down the following user request into a step-by-step plan.
Each step should have:
- id: unique step identifier
- type: one of "analysis", "execution", "browser_action", "api_call", "verification"
- action: the specific action to take
- description: what this step does
- input: what data is needed for this step

User request: "${naturalLanguage}"

Respond with a JSON object:
{
  "goal": "summary of the goal",
  "steps": [
    { "id": "step-1", "type": "...", "action": "...", "description": "...", "input": {} }
  ]
}`;

      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL_MINI,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from AI');

      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`AI planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        goal: naturalLanguage,
        steps: [
          {
            id: 'step-1',
            type: 'analysis',
            action: 'understand_task',
            description: 'Understand user request',
            input: naturalLanguage,
          },
          {
            id: 'step-2',
            type: 'execution',
            action: 'perform_action',
            description: 'Execute main task using tools',
            input: {},
          },
          {
            id: 'step-3',
            type: 'verification',
            action: 'verify_result',
            description: 'Validate output quality',
            input: {},
          },
        ],
      };
    }
  }
}