import { Injectable, Logger } from '@nestjs/common';
import { MemoryStoreService } from './memory-store.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface UserPreferences {
  preferredFood?: string;
  preferredSeat?: string;
  preferredHotel?: string;
  preferredAirline?: string;
  priceSensitivity?: 'low' | 'medium' | 'high';
  other?: Record<string, string>;
}

@Injectable()
export class ExecutionMemoryService {
  private readonly logger = new Logger(ExecutionMemoryService.name);
  private openai: OpenAI;

  constructor(
    private memoryStore: MemoryStoreService,
    private configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async savePreference(userId: string, key: string, value: string): Promise<void> {
    this.logger.log(`Saving semantic preference: ${key} = ${value} for user ${userId}`);
    await this.memoryStore.store(
      userId,
      'SEMANTIC',
      `preference:${key}`,
      `The user prefers ${value} for ${key}.`,
      0.9,
    );
  }

  async recallPreferences(userId: string, query: string): Promise<UserPreferences> {
    this.logger.log(`Recalling user preferences relevant to: "${query}"`);
    const memories = await this.memoryStore.recall(userId, query, {
      limit: 10,
      similarityThreshold: 0.5,
    });

    if (memories.length === 0) return {};

    const systemPrompt = `You are a user preference extraction engine. Below are fragments of memories retrieved from the database regarding a user.
Extract a structured preferences JSON from these memories.

Memories:
${memories.map((m) => `- ${m.content}`).join('\n')}

Format your response strictly as a JSON object of this type:
{
  "preferredFood": "e.g., Biryani",
  "preferredSeat": "e.g., Window",
  "preferredHotel": "e.g., 4 Star",
  "preferredAirline": "e.g., Indigo",
  "priceSensitivity": "low | medium | high",
  "other": { "key": "value" }
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return {};

      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`Failed to extract user preferences from memories: ${error.message}`);
      return {};
    }
  }

  async extractAndSavePreferencesFromGoal(userId: string, goal: string): Promise<void> {
    this.logger.log(`Extracting implicit preferences from goal: "${goal}"`);

    const systemPrompt = `You are a user preference learning engine. Analyze the natural language goal provided by the user. If they express any specific personal preference (e.g., flight seats, room options, food choices, price sensitivity), extract it.
Goal: "${goal}"

Output exactly in this JSON format:
{
  "extracted": [
    { "key": "preferredSeat", "value": "Window seat" },
    { "key": "preferredFood", "value": "Biryani" }
  ]
}
If no explicit or clear preference is present, return an empty array. Respond in valid JSON only.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return;

      const parsed = JSON.parse(content);
      const extractions = parsed.extracted || [];

      for (const item of extractions) {
        await this.savePreference(userId, item.key, item.value);
      }
    } catch (error: any) {
      this.logger.error(`Failed to extract and save preferences: ${error.message}`);
    }
  }
}
