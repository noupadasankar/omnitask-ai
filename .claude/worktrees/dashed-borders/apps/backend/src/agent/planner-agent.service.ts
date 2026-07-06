// backend/src/agent/planner-agent.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AgentPlan, PlannedStep } from '../shared/interfaces/agent.interfaces';
import { SkillRegistryService } from './skill-registry.service';
import { UserProfileMemoryService } from './user-profile-memory.service';

@Injectable()
export class PlannerAgentService {
  private readonly logger = new Logger(PlannerAgentService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private skillRegistry: SkillRegistryService,
    private userProfileMemory: UserProfileMemoryService,
  ) {
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
      userId?: string;
      strategyHints?: string; // Injected from StrategyMemoryService.formatStrategiesForPlanner()
    },
  ): Promise<AgentPlan> {
    this.logger.log(`Creating plan for goal: "${goal}"`);

    // 1. Load context details
    const profileCard = context?.userId 
      ? await this.userProfileMemory.getProfileCard(context.userId) 
      : null;

    const availableSkills = this.skillRegistry.listSkills();

    // 2. Format profile and skill context
    const profileContext = profileCard ? `
USER PROFILE MEMORY CARD:
- Name: ${profileCard.name || 'Not provided'}
- Email: ${profileCard.email || 'Not provided'}
- Phone: ${profileCard.phone || 'Not provided'}
- Saved Addresses: ${JSON.stringify(profileCard.addresses)}
- Payment Preferences: ${JSON.stringify(profileCard.paymentPreferences)}
- Favorite/Preferred Websites: ${JSON.stringify(profileCard.favoriteSites)}
- Saved Resumes/Files: ${JSON.stringify(profileCard.resumes)}
Use these details directly in planned typing values (e.g. email, phone, name, address) to prevent redundant user questions.
` : 'USER PROFILE MEMORY CARD: No profile data saved yet.';

    const skillsContext = `
UNIVERSAL SKILLS REGISTRY:
${availableSkills.map((skill) => `
- Skill: ${skill.name}
  Description: ${skill.description}
  Parameters: ${JSON.stringify(skill.parameters)}
  Standard Instructions:
  ${skill.instructions.map((inst, idx) => `  ${idx + 1}. ${inst}`).join('\n  ')}
`).join('\n')}
`;

    // Strategy hints from StrategyMemoryService — recalled from past successful runs
    const strategyContext = context?.strategyHints || '';

    const systemPrompt = `You are an autonomous browser agent planner powered by a Universal Task Execution Engine.
Your job is to decompose a user's goal into precise, executable browser steps mapped to universal skills.

${strategyContext}

UNIVERSAL CORE TASK TYPES:
1. Search Tasks: Search → Analyze → Compare → Report
2. Form Tasks: Open Form → Map Fields → Fill Data → Verify → Submit
3. Purchase Tasks: Find Item → Compare Options → Add Cart → Request Approval → Pay
4. Monitoring Tasks: Watch → Detect Changes → Notify
5. Research Tasks: Browse → Collect Data → Summarize → Report

${skillsContext}

${profileContext}

RULES:
1. Each step must be a single atomic browser action.
2. Use CSS selectors when possible for targets.
3. Include wait conditions between page navigations.
4. Mark risky actions (purchases, submissions, deletions) as HIGH or CRITICAL risk.
5. Include validation steps after important actions.
6. Plan for common failure scenarios with fallback steps.
7. Be specific — "click the Sign In button" not "log in".
8. Associate each step with the relevant universal skill from the registry by setting the "skillName" attribute (e.g., "SearchSkill", "FormFillSkill", etc.).
9. Auto-detect which skills from the registry are needed to achieve the goal and return the array of skill names in "skillsUsed".

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

OUTPUT FORMAT: Respond with valid JSON only in this exact schema:
{
  "goal": "Decomposed goal summary",
  "skillsUsed": ["SearchSkill", "FormFillSkill"],
  "estimatedDuration": 120,
  "riskAssessment": {
    "overallRisk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "reasons": ["Contains payment verification step"],
    "requiresUserApproval": true | false
  },
  "steps": [
    {
      "index": 0,
      "action": "action_name",
      "target": "target_selector_or_description_or_null",
      "value": "action_value_or_null",
      "description": "Short human description",
      "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "requiresApproval": true | false,
      "skillName": "SkillName_or_null"
    }
  ]
}
No markdown, no explanation, no backticks outside the JSON.`;

    const userPrompt = this.buildUserPrompt(goal, context);

    // No LLM key configured → don't attempt a guaranteed-failing call; the
    // engine runs the local rule-based Python skill for the routed domain.
    if (!this.hasLlm()) {
      this.logger.warn(
        'No LLM API key configured — using local deterministic planner (zero-token).',
      );
      return this.localFallbackPlan(goal);
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 3000,
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
        skillsUsed: plan.skillsUsed || [],
        riskAssessment: plan.riskAssessment || {
          overallRisk: 'MEDIUM',
          reasons: ['Auto-assessed'],
          requiresUserApproval: false,
        },
      };

      this.logger.log(
        `Plan created: ${enhancedPlan.steps.length} steps, risk: ${enhancedPlan.riskAssessment.overallRisk}, skills: ${JSON.stringify(enhancedPlan.skillsUsed)}`,
      );

      return enhancedPlan;
    } catch (error: any) {
      // The platform must not be hard-dependent on an external LLM. Any planner
      // failure (no credits / 402, rate limit, network, invalid key) degrades to
      // a local deterministic plan, and the Python engine runs the routed domain
      // skill (rule-based, zero-token). The browser still launches + streams.
      this.logger.warn(
        `LLM planning unavailable (${error.message}) — falling back to local deterministic planner.`,
      );
      return this.localFallbackPlan(goal);
    }
  }

  /** True when a usable LLM API key is configured. */
  private hasLlm(): boolean {
    const key =
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('OPENROUTER_API_KEY') ||
      '';
    return key.trim().length > 0;
  }

  /**
   * Zero-token plan used when the LLM is unavailable. The steps are intentionally
   * minimal: when the router found no site plugin, ExecutionEngine sets a
   * `skillHint` from the domain and the Python executor runs that local skill
   * (search/extract/apply), ignoring these steps. This keeps the platform
   * functional with no external LLM dependency.
   */
  private localFallbackPlan(goal: string): AgentPlan {
    return {
      taskId: '',
      goal,
      steps: [
        {
          index: 0,
          action: 'wait',
          value: '800',
          description: 'Initialize local agent runtime',
          riskLevel: 'LOW',
          requiresApproval: false,
        },
      ],
      estimatedDuration: 60,
      skillsUsed: [],
      riskAssessment: {
        overallRisk: 'MEDIUM',
        reasons: ['Local deterministic plan (LLM unavailable) — domain skill will execute'],
        requiresUserApproval: false,
      },
    };
  }

  async replanFromStep(
    originalPlan: AgentPlan,
    failedStepIndex: number,
    errorDescription: string,
    screenshotAnalysis?: string,
    context?: {
      userId?: string;
    },
  ): Promise<PlannedStep[]> {
    this.logger.log(`Replanning from step ${failedStepIndex}: ${errorDescription}`);

    const profileCard = context?.userId 
      ? await this.userProfileMemory.getProfileCard(context.userId) 
      : null;

    const profileContext = profileCard ? `
USER PROFILE MEMORY CARD:
${JSON.stringify(profileCard)}
` : '';

    const completedSteps = originalPlan.steps.slice(0, failedStepIndex);
    const remainingGoal = originalPlan.steps
      .slice(failedStepIndex)
      .map((s) => s.description)
      .join(' → ');

    const prompt = `The original plan failed at step ${failedStepIndex}.
    
COMPLETED STEPS:
${completedSteps.map((s) => `✅ ${s.index}: ${s.description} (Skill: ${s.skillName || 'None'})`).join('\n')}

FAILED STEP:
❌ ${failedStepIndex}: ${originalPlan.steps[failedStepIndex]?.description}

ERROR: ${errorDescription}

${screenshotAnalysis ? `CURRENT SCREEN STATE: ${screenshotAnalysis}` : ''}

${profileContext}

REMAINING GOAL: ${remainingGoal}

Create new steps to achieve the remaining goal from the current state. Start index from ${failedStepIndex}.
Provide skillName parameter matching the relevant universal skill from the registry.

Respond with JSON: { "steps": [...] }`;

    if (!this.hasLlm()) {
      this.logger.warn('No LLM API key configured — skipping replan (no new steps).');
      return [];
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are replanning browser automation steps after a failure. Output valid JSON only with a "steps" array containing skillName mapping.',
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
      // Don't abort the run if the LLM is unavailable — return no replacement
      // steps and let the engine's other recovery paths handle the failure.
      this.logger.warn(`Replanning unavailable (${error.message}) — no new steps.`);
      return [];
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
      skillName: step.skillName || undefined,
      fallback: step.fallback || undefined,
      waitCondition: step.waitCondition || undefined,
      validation: step.validation || undefined,
    }));
  }
}
