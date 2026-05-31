import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ParsedGoal {
  taskType: string; // e.g., 'food_order', 'ticket_booking', 'shopping', 'job_search', 'bill_payment', 'form_fill', 'price_comparison', 'hotel_booking', 'flight_search', 'general'
  intent: string;
  entities: Record<string, any>;
  constraints: string[];
  preferredWebsites: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  requiresPayment: boolean;
  requiresLogin: boolean;
  sensitiveData: boolean;
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

    const systemPrompt = `You are an expert natural language understanding agent for a general-purpose autonomous web AI assistant.
Your goal is to parse user request prompts and decompose them into structured tasks.

Understand Indian service providers and context deeply:
- Food: Swiggy, Zomato
- Ticket booking: BookMyShow, Paytm, IRCTC
- Shopping: Flipkart, Amazon.in, Myntra, Ajio
- Travel/Hotel: MakeMyTrip, Cleartrip, Yatra, Goibibo
- Bills: Paytm, Google Pay, electricity boards

Extract the following structured elements:
1. taskType: 'food_order' | 'ticket_booking' | 'shopping' | 'job_search' | 'bill_payment' | 'form_fill' | 'price_comparison' | 'hotel_booking' | 'flight_search' | 'general'
2. intent: High-level descriptive goal summary.
3. entities: Key parameters extracted (e.g. food items, locations, date/time, quantities, job title).
4. constraints: List of any strict guidelines or rules (e.g., budget under ₹300, 4-star rating, window seat).
5. preferredWebsites: Target website domains based on context (e.g. ['swiggy.com', 'zomato.com'] for food order).
6. estimatedComplexity: 'simple' | 'moderate' | 'complex'
7. requiresPayment: true/false (requires credit cards, OTP, net banking)
8. requiresLogin: true/false (requires personal logins, OAuth, OTP)
9. sensitiveData: true/false (whether goal involves entering passwords, bank details, PII)

Format your response strictly as a JSON object matching the requested schema. Do not include markdown wraps or explanations.`;

    const userPrompt = `Goal: "${naturalLanguageGoal}"
${userContext?.memories?.length ? `User Memories:\n${userContext.memories.map((m) => `- ${m}`).join('\n')}` : ''}
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
      this.logger.log(`Parsed task type: ${parsed.taskType}, complexity: ${parsed.estimatedComplexity}`);
      return parsed;
    } catch (error: any) {
      this.logger.error(`Goal parsing failed: ${error.message}`);
      // Return safe fallback
      return {
        taskType: 'general',
        intent: naturalLanguageGoal,
        entities: {},
        constraints: [],
        preferredWebsites: [],
        estimatedComplexity: 'moderate',
        requiresPayment: false,
        requiresLogin: false,
        sensitiveData: false,
      };
    }
  }

  async refineGoal(currentGoal: ParsedGoal, userFeedback: string): Promise<ParsedGoal> {
    this.logger.log(`Refining goal based on user feedback: "${userFeedback}"`);

    const systemPrompt = `You are an expert goal refinement assistant. You are given a parsed task state and a user's conversational correction or addition.
Refine and update the parsed goal structure based on the feedback.

Respond with valid JSON matching the ParseGoal schema.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Current Goal: ${JSON.stringify(currentGoal)}\nFeedback: "${userFeedback}"`,
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return currentGoal;

      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`Goal refinement failed: ${error.message}`);
      return currentGoal;
    }
  }
}
