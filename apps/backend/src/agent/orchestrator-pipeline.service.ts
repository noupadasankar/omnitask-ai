import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL } from '../common/llm-config';
import { GoalUnderstandingService, ParsedGoal } from './goal-understanding.service';

export interface OrchestratorPlan {
  goal: string;
  taskType: string;
  parsedGoal: ParsedGoal;
  integration: string;
  requiredCredentials: string[];
  steps: OrchestratorStep[];
  estimatedComplexity: string;
  requiresUserInput: boolean;
  userQuestions: string[];
}

export interface OrchestratorStep {
  index: number;
  action: string;
  description: string;
  requiresApproval: boolean;
  expectedOutcome: string;
}

/**
 * @responsibility Goal parsing → plan creation → single-agent execution dispatch.
 * Does NOT manage multi-agent sessions or agent lifecycle.
 * Use MultiAgentCoordinatorService for parallel agent orchestration.
 */
@Injectable()
export class OrchestratorPipelineService {
  private readonly logger = new Logger(OrchestratorPipelineService.name);

  constructor(
    private readonly llm: LlmService,
    private goalUnderstanding: GoalUnderstandingService,
  ) {}

  async processTask(userId: string, goal: string): Promise<OrchestratorPlan> {
    this.logger.log(`[OrchestratorPipeline] Processing task: "${goal}"`);

    const jsonPlan = await this.generateJsonPlan(goal);

    const parsedGoal = await this.goalUnderstanding.parseGoal(goal);

    const enriched: OrchestratorPlan = {
      goal,
      taskType: jsonPlan.integration || parsedGoal.taskType,
      parsedGoal,
      integration: jsonPlan.integration || this.detectIntegration(parsedGoal),
      requiredCredentials: jsonPlan.requiredCredentials || this.getRequiredCredentials(parsedGoal),
      steps: jsonPlan.steps || [],
      estimatedComplexity: jsonPlan.estimatedComplexity || parsedGoal.estimatedComplexity,
      requiresUserInput: (jsonPlan.requiresUserInput ?? false) || parsedGoal.ambiguityScore > 0.4,
      userQuestions: jsonPlan.userQuestions || parsedGoal.clarifyingQuestions || [],
    };

    this.logger.log(
      `[OrchestratorPipeline] Plan: integration=${enriched.integration}, ` +
      `steps=${enriched.steps.length}, requiresInput=${enriched.requiresUserInput}`,
    );

    return enriched;
  }

  private async generateJsonPlan(goal: string): Promise<any> {
    if (!this.hasLlm()) {
      this.logger.warn('No LLM configured — using heuristic plan generation');
      return this.heuristicPlan(goal);
    }

    const systemPrompt = `You are an autonomous AI agent orchestrator. Given a user task, you must:
1. Decide which integration to call (job, food, email, music, shopping, research, travel, social, media)
2. Identify what credentials/data the user needs to provide
3. Output a step-by-step execution plan

Respond ONLY with a JSON object. No markdown, no explanation.

Schema:
{
  "integration": "which system to use",
  "requiredCredentials": ["list of required credentials"],
  "estimatedComplexity": "simple | moderate | complex",
  "requiresUserInput": true/false,
  "userQuestions": ["questions to ask the user if ambiguous"],
  "steps": [
    {
      "index": 0,
      "action": "navigate | search | extract | fill | submit | read | play | compose",
      "description": "what to do",
      "requiresApproval": true/false,
      "expectedOutcome": "what should happen"
    }
  ]
}`;

    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Task: "${goal}"\nOutput the JSON plan.` },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return this.heuristicPlan(goal);

      return JSON.parse(content);
    } catch {
      return this.heuristicPlan(goal);
    }
  }

  private heuristicPlan(goal: string): any {
    const g = goal.toLowerCase();
    const has = (re: RegExp) => re.test(g);

    if (has(/\b(job|apply|naukri|linkedin|career)\b/)) {
      return {
        integration: 'job',
        requiredCredentials: ['linkedin_email', 'linkedin_password', 'resume_cv'],
        estimatedComplexity: 'complex',
        requiresUserInput: true,
        userQuestions: ['What job title are you looking for?', 'Which portals should I check?'],
        steps: [
          { index: 0, action: 'navigate', description: 'Open job portal and log in', requiresApproval: true, expectedOutcome: 'Logged into portal' },
          { index: 1, action: 'search', description: 'Search for matching jobs', requiresApproval: false, expectedOutcome: 'Job listings found' },
          { index: 2, action: 'fill', description: 'Fill application form with CV data', requiresApproval: false, expectedOutcome: 'Form filled' },
          { index: 3, action: 'submit', description: 'Submit application', requiresApproval: true, expectedOutcome: 'Application submitted' },
        ],
      };
    }

    if (has(/\b(email|mail|gmail|outlook|inbox|send|compose)\b/)) {
      return {
        integration: 'email',
        requiredCredentials: ['email_credentials'],
        estimatedComplexity: 'moderate',
        requiresUserInput: true,
        userQuestions: has(/send/) ? ['Who should I send it to?', 'What should the subject be?'] : [],
        steps: [
          { index: 0, action: 'navigate', description: 'Open email service', requiresApproval: true, expectedOutcome: 'Email service loaded' },
          { index: 1, action: has(/send/) ? 'compose' : 'read', description: has(/send/) ? 'Compose new email' : 'Read inbox messages', requiresApproval: true, expectedOutcome: has(/send/) ? 'Email composed' : 'Messages loaded' },
        ],
      };
    }

    if (has(/\b(music|song|playlist|spotify|youtube|play|listen)\b/)) {
      return {
        integration: 'media',
        requiredCredentials: [],
        estimatedComplexity: 'simple',
        requiresUserInput: true,
        userQuestions: ['What song or artist should I play?'],
        steps: [
          { index: 0, action: 'search', description: `Search for "${goal}" on music platform`, requiresApproval: false, expectedOutcome: 'Results found' },
          { index: 1, action: 'play', description: 'Play selected track', requiresApproval: false, expectedOutcome: 'Music playing' },
        ],
      };
    }

    if (has(/\b(order|food|swiggy|zomato|restaurant|pizza|biryani)\b/)) {
      return {
        integration: 'food',
        requiredCredentials: ['food_app_credentials'],
        estimatedComplexity: 'moderate',
        requiresUserInput: true,
        userQuestions: ['What specific dish or restaurant?', 'Any budget limit?'],
        steps: [
          { index: 0, action: 'navigate', description: 'Open food delivery app', requiresApproval: true, expectedOutcome: 'App loaded' },
          { index: 1, action: 'search', description: 'Search for dishes/restaurants', requiresApproval: false, expectedOutcome: 'Options displayed' },
          { index: 2, action: 'fill', description: 'Add items to cart', requiresApproval: false, expectedOutcome: 'Cart updated' },
          { index: 3, action: 'submit', description: 'Place order', requiresApproval: true, expectedOutcome: 'Order confirmed' },
        ],
      };
    }

    if (has(/\b(buy|shop|amazon|flipkart|cart|price|deal)\b/)) {
      return {
        integration: 'shopping',
        requiredCredentials: ['shopping_credentials'],
        estimatedComplexity: 'moderate',
        requiresUserInput: true,
        userQuestions: ['What product?', 'Maximum budget?'],
        steps: [
          { index: 0, action: 'search', description: 'Search for product across platforms', requiresApproval: false, expectedOutcome: 'Products found' },
          { index: 1, action: 'extract', description: 'Compare prices and reviews', requiresApproval: false, expectedOutcome: 'Best option identified' },
          { index: 2, action: 'navigate', description: 'Add to cart on best platform', requiresApproval: false, expectedOutcome: 'Item in cart' },
          { index: 3, action: 'submit', description: 'Complete purchase', requiresApproval: true, expectedOutcome: 'Purchase complete' },
        ],
      };
    }

    return {
      integration: 'research',
      requiredCredentials: [],
      estimatedComplexity: 'moderate',
      requiresUserInput: false,
      userQuestions: [],
      steps: [
        { index: 0, action: 'search', description: `Search the web for: ${goal}`, requiresApproval: false, expectedOutcome: 'Search results' },
        { index: 1, action: 'extract', description: 'Extract and summarize information', requiresApproval: false, expectedOutcome: 'Summary generated' },
      ],
    };
  }

  private detectIntegration(parsedGoal: ParsedGoal): string {
    const map: Record<string, string> = {
      job_search: 'job',
      food_order: 'food',
      shopping: 'shopping',
      price_comparison: 'shopping',
      ticket_booking: 'travel',
      hotel_booking: 'travel',
      flight_search: 'travel',
      research: 'research',
      email_send: 'email',
      email_read: 'email',
      email_search: 'email',
      email_reply: 'email',
      email_manage: 'email',
      music_play: 'media',
      music_search: 'media',
      video_play: 'media',
      media_control: 'media',
    };
    return map[parsedGoal.taskType] || 'research';
  }

  private getRequiredCredentials(parsedGoal: ParsedGoal): string[] {
    if (parsedGoal.requiresLogin) {
      const credentialMap: Record<string, string[]> = {
        job: ['linkedin_credentials'],
        food: ['food_app_credentials'],
        shopping: ['shopping_credentials'],
        email: ['email_credentials'],
        travel: ['travel_credentials'],
      };
      return credentialMap[this.detectIntegration(parsedGoal)] || [];
    }
    return [];
  }

  private hasLlm(): boolean {
    return this.llm.available;
  }
}
