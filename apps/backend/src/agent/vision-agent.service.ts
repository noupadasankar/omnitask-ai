// backend/src/agent/vision-agent.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  VisionAnalysis,
  SuggestedAction,
  PlannedStep,
} from '../shared/interfaces/agent.interfaces';

@Injectable()
export class VisionAgentService {
  private readonly logger = new Logger(VisionAgentService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async analyzeScreenshot(
    screenshotBase64: string,
    context: {
      currentStep?: PlannedStep;
      goal?: string;
      previousActions?: string[];
      expectedState?: string;
    },
  ): Promise<VisionAnalysis> {
    this.logger.debug('Analyzing screenshot with GPT-4o Vision...');

    const systemPrompt = `You are a browser automation vision agent. You analyze screenshots of web pages and determine:
1. What is currently displayed on the screen
2. What interactive elements are visible
3. Whether the current state matches expectations
4. What action should be taken next

RULES:
- Be precise about element locations and types
- Identify any errors, CAPTCHAs, pop-ups, or unexpected dialogs
- Suggest CSS selectors when possible
- Always include confidence scores (0-1)

OUTPUT FORMAT: Respond with valid JSON only.`;

    let userContent = '';
    if (context.currentStep) {
      userContent += `CURRENT STEP: ${context.currentStep.description}\n`;
      userContent += `EXPECTED ACTION: ${context.currentStep.action} on "${context.currentStep.target || 'page'}"\n`;
    }
    if (context.goal) {
      userContent += `OVERALL GOAL: ${context.goal}\n`;
    }
    if (context.expectedState) {
      userContent += `EXPECTED STATE: ${context.expectedState}\n`;
    }
    if (context.previousActions?.length) {
      userContent += `PREVIOUS ACTIONS:\n${context.previousActions.slice(-5).join('\n')}\n`;
    }
    userContent += '\nAnalyze this screenshot and provide the next action:';

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userContent },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${screenshotBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty vision response');

      const analysis = JSON.parse(content) as VisionAnalysis;
      this.logger.debug(
        `Vision analysis: ${analysis.currentState.substring(0, 100)}...`,
      );

      return analysis;
    } catch (error: any) {
      this.logger.error(`Vision analysis failed: ${error.message}`);
      return {
        currentState: 'Analysis failed',
        elementsDetected: [],
        suggestedAction: {
          action: 'screenshot',
          reasoning: 'Retry analysis',
          confidence: 0,
        },
        confidence: 0,
        isExpectedState: false,
        errorDetected: true,
        errorDescription: error.message,
      };
    }
  }

  async validateStepCompletion(
    beforeScreenshot: string,
    afterScreenshot: string,
    step: PlannedStep,
  ): Promise<{
    completed: boolean;
    confidence: number;
    description: string;
  }> {
    this.logger.debug(`Validating step ${step.index}: ${step.description}`);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You validate whether a browser action was completed successfully by comparing before and after screenshots.
Output JSON: { "completed": boolean, "confidence": 0-1, "description": "what changed or didn't" }`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `ACTION PERFORMED: ${step.action} on "${step.target}" with value "${step.value}"\nDESCRIPTION: ${step.description}\n\nBEFORE screenshot:`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${beforeScreenshot}`,
                  detail: 'low',
                },
              },
              { type: 'text', text: 'AFTER screenshot:' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${afterScreenshot}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty validation response');

      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`Validation failed: ${error.message}`);
      return {
        completed: true,
        confidence: 0.3,
        description: 'Validation could not be performed',
      };
    }
  }

  async detectBlockers(
    screenshotBase64: string,
  ): Promise<{
    hasBlocker: boolean;
    blockerType?: 'captcha' | 'login' | 'error' | 'cookie_consent' | 'paywall' | 'rate_limit' | 'popup';
    description?: string;
    suggestedResolution?: string;
  }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Detect if there are any blockers on this webpage screenshot (CAPTCHAs, login walls, error pages, cookie consent, paywalls, rate limits, popups).
Output JSON: { "hasBlocker": boolean, "blockerType": "captcha|login|error|cookie_consent|paywall|rate_limit|popup" or null, "description": "..." or null, "suggestedResolution": "..." or null }`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this screenshot for blockers:' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${screenshotBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return { hasBlocker: false };

      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`Blocker detection failed: ${error.message}`);
      return { hasBlocker: false };
    }
  }
}
