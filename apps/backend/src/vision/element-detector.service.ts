import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';

export interface InteractiveElement {
  selector?: string;
  type: 'button' | 'input' | 'link' | 'checkbox' | 'dropdown' | 'other';
  text?: string;
  box: { x: number; y: number; width: number; height: number };
  accessibilityLabel?: string;
}

@Injectable()
export class ElementDetectorService {
  private readonly logger = new Logger(ElementDetectorService.name);

  constructor(private readonly llm: LlmService) {}

  async detectElements(screenshotBase64: string): Promise<InteractiveElement[]> {
    this.logger.debug('Detecting interactive elements on screenshot using GPT-4o Vision...');
    const systemPrompt = `You are a web layout vision engine. Analyze the screenshot and list all visible interactive elements (buttons, inputs, links, checkboxes, dropdowns).
For each element, specify its text label, estimated bounding box in percentages (x, y, width, height relative to top-left 0-100), and an estimated selector.

Output strict JSON:
{
  "elements": [
    {
      "type": "button|input|link|checkbox|dropdown|other",
      "text": "label",
      "box": { "x": number, "y": number, "width": number, "height": number },
      "accessibilityLabel": "accessibility or aria label if visible",
      "selector": "suggested selector"
    }
  ]
}`;
    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: this.llm.visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all interactive elements from this screenshot:' },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${screenshotBase64}`, detail: 'high' },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];
      const parsed = JSON.parse(content);
      return parsed.elements || [];
    } catch (err: any) {
      this.logger.error(`Element detection failed: ${err.message}`);
      return [];
    }
  }
}
