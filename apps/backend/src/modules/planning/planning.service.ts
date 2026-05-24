import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PlanValidator, ValidatedPlan } from './plan-validator';
import { PlanHasher } from './plan-hasher';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { FEW_SHOT_EXAMPLES } from './prompts/few-shot.examples';

export interface PlanResult { plan: ValidatedPlan; hash: string; tokensUsed: number; }

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly config: ConfigService,
    private readonly validator: PlanValidator,
    private readonly hasher: PlanHasher,
  ) {
    this.openai = new OpenAI({ apiKey: config.getOrThrow('OPENAI_API_KEY') });
  }

  async generatePlan(rawInput: string, context?: { pastPlans?: any[]; userPolicies?: any[] }): Promise<PlanResult> {
    this.logger.log(`Planning for: "${rawInput.slice(0, 80)}..."`);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...FEW_SHOT_EXAMPLES,
    ];

    if (context?.pastPlans?.length) {
      messages.push({ role: 'user', content: `Relevant past successful plans for context:\n${JSON.stringify(context.pastPlans.slice(0, 3), null, 2)}` });
      messages.push({ role: 'assistant', content: 'I\'ll use these past plans as reference for similar patterns.' });
    }

    messages.push({ role: 'user', content: `Task: ${rawInput}\n\nGenerate a precise execution plan as JSON only. No markdown, no explanation.` });

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from LLM');

        const raw = JSON.parse(content);
        const plan = this.validator.validate(raw);
        const hash = this.hasher.hash(plan);

        this.logger.log(`Plan generated: ${plan.steps.length} steps, risk: ${plan.riskLevel}`);
        return { plan, hash, tokensUsed: response.usage?.total_tokens ?? 0 };
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`Planning attempt ${attempt}/3 failed: ${err.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    throw new ServiceUnavailableException(`Planning failed after 3 attempts: ${lastError?.message}`);
  }

  async repairStep(failedStep: any, error: string, domSnapshot?: string): Promise<any> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a browser automation repair agent. Given a failed step and its error, suggest an alternative approach. Return JSON only.' },
        { role: 'user', content: `Failed step: ${JSON.stringify(failedStep)}\nError: ${error}\n${domSnapshot ? `DOM context: ${domSnapshot.slice(0, 2000)}` : ''}\n\nSuggest 1-3 alternative steps.` },
      ],
      temperature: 0.2, response_format: { type: 'json_object' }, max_tokens: 500,
    });
    return JSON.parse(response.choices[0]?.message?.content ?? '{}');
  }
}