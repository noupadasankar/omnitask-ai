// backend/src/agent/goal-understanding.service.ts
//
// Upgraded: now returns ambiguityScore + clarifyingQuestions.
// If ambiguityScore > 0.6, the execution engine pauses before planning
// and the frontend shows the clarifying questions to the user.
// This prevents the agent from confidently executing the wrong thing.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ParsedGoal {
  taskType: string; // 'food_order' | 'ticket_booking' | 'shopping' | 'job_search' | 'bill_payment' | 'form_fill' | 'price_comparison' | 'hotel_booking' | 'flight_search' | 'research' | 'general'
  intent: string;
  entities: Record<string, any>;
  constraints: string[];
  preferredWebsites: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  requiresPayment: boolean;
  requiresLogin: boolean;
  sensitiveData: boolean;
  // ─── NEW: Cognitive safety additions ──────────────────
  ambiguityScore: number;         // 0.0 (crystal clear) → 1.0 (completely vague)
  clarifyingQuestions: string[];  // Questions to ask user if ambiguityScore > 0.6
  confidence: number;             // Parser's own confidence in this interpretation
}

@Injectable()
export class GoalUnderstandingService {
  private readonly logger = new Logger(GoalUnderstandingService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async parseGoal(
    naturalLanguageGoal: string,
    userContext?: { memories?: string[]; preferences?: Record<string, any> },
  ): Promise<ParsedGoal> {
    this.logger.log(`Parsing natural language goal: "${naturalLanguageGoal}"`);

    // No LLM configured → skip the guaranteed-failing call and route by local
    // keyword intent detection (zero-token, no vendor dependency).
    if (!this.hasLlm()) {
      this.logger.warn('No LLM API key configured — using local heuristic goal parser.');
      return this.heuristicParse(naturalLanguageGoal);
    }

    const systemPrompt = `You are an expert natural language understanding agent for a general-purpose autonomous web AI assistant.
Your goal is to parse user request prompts and decompose them into structured tasks.

Understand Indian service providers and context deeply:
- Food: Swiggy, Zomato
- Ticket booking: BookMyShow, Paytm, IRCTC
- Shopping: Flipkart, Amazon.in, Myntra, Ajio
- Travel/Hotel: MakeMyTrip, Cleartrip, Yatra, Goibibo
- Bills: Paytm, Google Pay, electricity boards

Extract the following structured elements:
1. taskType: 'food_order' | 'ticket_booking' | 'shopping' | 'job_search' | 'bill_payment' | 'form_fill' | 'price_comparison' | 'hotel_booking' | 'flight_search' | 'research' | 'general'
2. intent: High-level descriptive goal summary (1–2 sentences, precise).
3. entities: Key parameters extracted (e.g. food items, locations, date/time, quantities, job title).
4. constraints: List of any strict guidelines or rules (e.g., budget under ₹300, 4-star rating, window seat).
5. preferredWebsites: Target website domains based on context.
6. estimatedComplexity: 'simple' | 'moderate' | 'complex'
7. requiresPayment: true/false
8. requiresLogin: true/false
9. sensitiveData: true/false
10. ambiguityScore: 0.0–1.0. How vague or underspecified is this request?
    - 0.0: Completely clear (e.g. "Search Google for OpenAI and summarize top 3 results")
    - 0.3: Minor ambiguity (location not specified, can be inferred)
    - 0.6: Significant ambiguity (multiple valid interpretations exist)
    - 0.8–1.0: Very vague (e.g. "do something useful", "help me with my work")
11. clarifyingQuestions: If ambiguityScore >= 0.5, provide 1–3 specific questions that would fully resolve the ambiguity.
    If ambiguityScore < 0.5, return empty array [].
12. confidence: 0.0–1.0. How confident are you in THIS specific interpretation?

Format your response strictly as a JSON object. Do not include markdown wraps or explanations.`;

    const userPrompt = `Goal: "${naturalLanguageGoal}"
${userContext?.memories?.length ? `User Memories:\n${userContext.memories.map(m => `- ${m}`).join('\n')}` : ''}
${userContext?.preferences ? `User Preferences: ${JSON.stringify(userContext.preferences)}` : ''}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from GPT-4o parser');

      const parsed: ParsedGoal = JSON.parse(content);

      // Ensure new fields have safe defaults if LLM omits them
      parsed.ambiguityScore = Math.max(0, Math.min(1, parsed.ambiguityScore ?? 0.3));
      parsed.clarifyingQuestions = parsed.clarifyingQuestions || [];
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.7));

      this.logger.log(
        `Parsed → type: ${parsed.taskType}, complexity: ${parsed.estimatedComplexity}, ambiguity: ${parsed.ambiguityScore.toFixed(2)}, confidence: ${parsed.confidence.toFixed(2)}`
      );

      return parsed;
    } catch (error: any) {
      // LLM unavailable (no credits / 402, rate limit, network). Don't fail the
      // run — route by local keyword intent detection so the domain skill still
      // executes (e.g. a job goal → the Job Agent).
      this.logger.warn(
        `Goal parsing via LLM unavailable (${error.message}) — using local heuristic parser.`,
      );
      return this.heuristicParse(naturalLanguageGoal);
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
   * Zero-token intent detection used when the LLM is unavailable. Maps the goal
   * to a taskType via keywords so AgentRouter routes it to the right local skill
   * (job/shopping/food/travel/research). Falls back to 'general' (web skill).
   */
  private heuristicParse(goal: string): ParsedGoal {
    const g = ` ${goal.toLowerCase()} `;
    const has = (re: RegExp) => re.test(g);

    let taskType: ParsedGoal['taskType'] = 'general';
    let requiresLogin = false;

    if (has(/\b(job|jobs|apply|applying|hiring|career|vacanc|recruit|naukri|linkedin|instahyre|hirist|cutshort)\b/)) {
      taskType = 'job_search';
      requiresLogin = true;
    } else if (has(/\b(flight|hotel|book(ing)?\s+(a\s+)?(ticket|train|bus|cab)|irctc|makemytrip|goibibo|trip|travel)\b/)) {
      taskType = 'flight_search';
    } else if (has(/\b(order|swiggy|zomato|restaurant|pizza|biryani|food|meal)\b/)) {
      taskType = 'food_order';
    } else if (has(/\b(buy|shop|cart|amazon|flipkart|myntra|ajio|price|cheapest|deal)\b/)) {
      taskType = has(/\bcompare|cheapest|price\b/) ? 'price_comparison' : 'shopping';
    } else if (has(/\b(research|find|summar|compare|analy|report|news|learn about)\b/)) {
      taskType = 'research';
    }

    return {
      taskType,
      intent: goal,
      entities: {},
      constraints: [],
      preferredWebsites: [],
      estimatedComplexity: 'moderate',
      requiresPayment: false,
      requiresLogin,
      sensitiveData: false,
      ambiguityScore: 0.3,
      clarifyingQuestions: [],
      confidence: 0.55,
    };
  }

  async refineGoal(
    currentGoal: ParsedGoal,
    userFeedback: string,
  ): Promise<ParsedGoal> {
    this.logger.log(`Refining goal based on user feedback: "${userFeedback}"`);

    const systemPrompt = `You are an expert goal refinement assistant. You are given a parsed task state and a user's conversational answer to clarifying questions.
Refine and update the parsed goal structure based on the feedback.
Specifically: reduce ambiguityScore after the user has clarified, and update entities/constraints with the new information.
Respond with valid JSON matching the ParsedGoal schema.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Current Goal State: ${JSON.stringify(currentGoal)}\nUser Clarification: "${userFeedback}"`,
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return currentGoal;

      const refined = JSON.parse(content) as ParsedGoal;
      refined.ambiguityScore = Math.max(0, Math.min(1, refined.ambiguityScore ?? 0));
      refined.clarifyingQuestions = refined.clarifyingQuestions || [];
      refined.confidence = Math.max(0, Math.min(1, refined.confidence ?? 0.9));

      this.logger.log(`Goal refined → new ambiguityScore: ${refined.ambiguityScore.toFixed(2)}`);
      return refined;
    } catch (error: any) {
      this.logger.error(`Goal refinement failed: ${error.message}`);
      return currentGoal;
    }
  }
}
