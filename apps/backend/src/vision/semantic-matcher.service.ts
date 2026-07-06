import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';

export interface MatcherResult {
  selectorMatched: string;
  confidence: number;
  reasoning: string;
  actionRequired?: 'click' | 'type' | 'wait' | 'close_popup' | 'none';
  actionValue?: string;
}

@Injectable()
export class SemanticMatcherService {
  private readonly logger = new Logger(SemanticMatcherService.name);

  constructor(private readonly llm: LlmService) {}

  async matchAlternative(
    screenshotBase64: string,
    failedSelector: string,
    stepDescription: string,
    errorMsg?: string,
  ): Promise<MatcherResult> {
    this.logger.log(`Matching semantic alternative for failed selector: "${failedSelector}" (Step: "${stepDescription}")`);

    const systemPrompt = `You are an autonomous browser selector matcher. An agent tried to execute an action on a selector, but it failed (either timed out, element disappeared, or renamed).
Analyze the screenshot and step description, and find a matching alternative selector on the current screen that achieves the same user intent.

For example:
- If target was 'button.apply-now' but it is not found, and you see 'button.quick-apply' or 'a.easy-apply-btn', match that selector.
- If a blocking modal or popup is open (cookie notice, newsletter popup), identify the close button (e.g. 'button.close-modal', 'svg.close-icon') and set actionRequired='close_popup' and selectorMatched='close selector'.

Output strict JSON:
{
  "selectorMatched": "the exact alternative CSS selector or close selector",
  "confidence": 0.0-1.0,
  "reasoning": "Why this selector achieves the step's goal",
  "actionRequired": "click|type|wait|close_popup|none",
  "actionValue": "value if we need to type or click"
}`;

    const userPrompt = `FAILED SELECTOR: "${failedSelector}"
STEP DESCRIPTION: "${stepDescription}"
${errorMsg ? `ERROR MESSAGE: "${errorMsg}"` : ''}

Find the alternative selector or resolution from the screenshot:`;

    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: this.llm.visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${screenshotBase64}`, detail: 'high' },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty semantic matcher response');
      return JSON.parse(content) as MatcherResult;
    } catch (err: any) {
      this.logger.error(`Semantic match failed: ${err.message}`);
      return {
        selectorMatched: failedSelector,
        confidence: 0,
        reasoning: `Failed to match semantically: ${err.message}`,
        actionRequired: 'none',
      };
    }
  }
}
