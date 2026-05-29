// backend/src/agent/planner-agent.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AgentPlan, PlannedStep } from '../shared/interfaces/agent.interfaces';

@Injectable()
export class PlannerAgentService {
  private readonly logger = new Logger(PlannerAgentService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async createPlan(
    goal: string,
    context?: {
      currentUrl?: string;
      previousSteps?: PlannedStep[];
      userPreferences?: Record<string, any>;
      memories?: string[];
    },
  ): Promise<AgentPlan> {
    this.logger.log(`Creating plan for goal: "${goal}"`);

    const systemPrompt = `You are an autonomous browser agent planner. Your job is to decompose a user's goal into precise, executable browser steps.

RULES:
1. Each step must be a single atomic browser action
2. Use CSS selectors when possible for targets
3. Include wait conditions between page navigations
4. Mark risky actions (purchases, submissions, deletions) as HIGH or CRITICAL risk
5. Include validation steps after important actions
6. Plan for common failure scenarios with fallback steps
7. Be specific — "click the Sign In button" not "log in"

AVAILABLE ACTIONS:
- navigate: Go to a URL (value = URL)
- click: Click an element (target = CSS selector or description)
- type: Type text (target = input selector, value = text)
- select: Select dropdown option (target = select selector, value = option value)
- scroll: Scroll the page (value = pixels, positive = down)
- hover: Hover over element (target = selector)
- press_key: Press a keyboard key (value = key name)
- wait: Wait for condition (value = ms or selector)
- extract_text: Get text from element (target = selector)
- extract_data: Get structured data (target = selector)
- screenshot: Take a screenshot for analysis
- upload_file: Upload a file (target = file input selector, value = filepath)
- evaluate: Run JavaScript in page (value = JS code)
- go_back: Navigate back
- refresh: Refresh page

RISK LEVELS:
- LOW: Navigation, reading, scrolling
- MEDIUM: Form filling, clicking buttons
- HIGH: Submitting forms, making accounts, sending messages
- CRITICAL: Payments, deletions, posting public content

OUTPUT FORMAT: Respond with valid JSON only. No markdown, no explanation.`;

    const userPrompt = this.buildUserPrompt(goal, context);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from planner');

      const plan = JSON.parse(content);

      const enhancedPlan: AgentPlan = {
        taskId: '',
        goal: plan.goal || goal,
        steps: this.validateSteps(plan.steps || []),
        estimatedDuration: plan.estimatedDuration || 60,
        riskAssessment: plan.riskAssessment || {
          overallRisk: 'MEDIUM',
          reasons: ['Auto-assessed'],
          requiresUserApproval: false,
        },
      };

      this.logger.log(
        `Plan created: ${enhancedPlan.steps.length} steps, risk: ${enhancedPlan.riskAssessment.overallRisk}`,
      );

      return enhancedPlan;
    } catch (error: any) {
      this.logger.error(`Planning failed: ${error.message}`);
      throw new Error(`Failed to create plan: ${error.message}`);
    }
  }

  async replanFromStep(
    originalPlan: AgentPlan,
    failedStepIndex: number,
    errorDescription: string,
    screenshotAnalysis?: string,
  ): Promise<PlannedStep[]> {
    this.logger.log(`Replanning from step ${failedStepIndex}: ${errorDescription}`);

    const completedSteps = originalPlan.steps.slice(0, failedStepIndex);
    const remainingGoal = originalPlan.steps
      .slice(failedStepIndex)
      .map((s) => s.description)
      .join(' → ');

    const prompt = `The original plan failed at step ${failedStepIndex}.
    
COMPLETED STEPS:
${completedSteps.map((s) => `✅ ${s.index}: ${s.description}`).join('\n')}

FAILED STEP:
❌ ${failedStepIndex}: ${originalPlan.steps[failedStepIndex]?.description}

ERROR: ${errorDescription}

${screenshotAnalysis ? `CURRENT SCREEN STATE: ${screenshotAnalysis}` : ''}

REMAINING GOAL: ${remainingGoal}

Create new steps to achieve the remaining goal from the current state. Start index from ${failedStepIndex}.
Respond with JSON: { "steps": [...] }`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are replanning browser automation steps after a failure. Output valid JSON only with a "steps" array.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty replan response');

      const result = JSON.parse(content);
      return this.validateSteps(result.steps || []);
    } catch (error: any) {
      this.logger.error(`Replanning failed: ${error.message}`);
      throw error;
    }
  }

  private buildUserPrompt(
    goal: string,
    context?: {
      currentUrl?: string;
      previousSteps?: PlannedStep[];
      userPreferences?: Record<string, any>;
      memories?: string[];
    },
  ): string {
    let prompt = `GOAL: ${goal}\n`;

    if (context?.currentUrl) {
      prompt += `\nCURRENT URL: ${context.currentUrl}`;
    }

    if (context?.previousSteps?.length) {
      prompt += `\nPREVIOUS STEPS COMPLETED:\n`;
      prompt += context.previousSteps
        .map((s) => `  ${s.index}. ${s.description}`)
        .join('\n');
    }

    if (context?.userPreferences) {
      prompt += `\nUSER PREFERENCES: ${JSON.stringify(context.userPreferences)}`;
    }

    if (context?.memories?.length) {
      prompt += `\nRELEVANT MEMORIES:\n`;
      prompt += context.memories.map((m) => `  - ${m}`).join('\n');
    }

    return prompt;
  }

  private validateSteps(steps: any[]): PlannedStep[] {
    return steps.map((step, i) => ({
      index: step.index ?? i,
      action: step.action || 'wait',
      target: step.target || undefined,
      value: step.value || undefined,
      description: step.description || `Step ${i}`,
      riskLevel: step.riskLevel || 'LOW',
      requiresApproval: step.requiresApproval || false,
      fallback: step.fallback || undefined,
      waitCondition: step.waitCondition || undefined,
      validation: step.validation || undefined,
    }));
  }
}
