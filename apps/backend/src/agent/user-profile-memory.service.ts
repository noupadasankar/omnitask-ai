import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryStoreService } from './memory-store.service';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL } from '../common/llm-config';

export interface UserProfileCard {
  name?: string;
  email?: string;
  phone?: string;
  addresses: string[];
  resumes: string[];
  paymentPreferences: Record<string, any>;
  favoriteSites: string[];
}

@Injectable()
export class UserProfileMemoryService {
  private readonly logger = new Logger(UserProfileMemoryService.name);

  constructor(
    private prisma: PrismaService,
    private memoryStore: MemoryStoreService,
    private readonly llm: LlmService,
  ) {}

  async saveProfileCard(userId: string, card: Partial<UserProfileCard>): Promise<void> {
    this.logger.log(`Saving persistent User Profile Memory Card for user: ${userId}`);

    const existing = await this.getProfileCard(userId);
    const updatedCard: UserProfileCard = {
      name: card.name ?? existing.name,
      email: card.email ?? existing.email,
      phone: card.phone ?? existing.phone,
      addresses: Array.from(new Set([...existing.addresses, ...(card.addresses || [])])),
      resumes: Array.from(new Set([...existing.resumes, ...(card.resumes || [])])),
      paymentPreferences: { ...existing.paymentPreferences, ...(card.paymentPreferences || {}) },
      favoriteSites: Array.from(new Set([...existing.favoriteSites, ...(card.favoriteSites || [])])),
    };

    // Store in database AgentMemory table with a dedicated key
    await this.memoryStore.upsert(
      `profile_card_${userId}`,
      userId,
      'SEMANTIC',
      'profile:card',
      JSON.stringify(updatedCard),
      1.0,
    );
  }

  async getProfileCard(userId: string): Promise<UserProfileCard> {
    const memory = await this.prisma.agentMemory.findUnique({
      where: { id: `profile_card_${userId}` },
    });

    if (!memory) {
      return {
        addresses: [],
        resumes: [],
        paymentPreferences: {},
        favoriteSites: [],
      };
    }

    try {
      return JSON.parse(memory.content);
    } catch {
      return {
        addresses: [],
        resumes: [],
        paymentPreferences: {},
        favoriteSites: [],
      };
    }
  }

  async autoLearnFromUserInteraction(userId: string, input: string): Promise<void> {
    this.logger.log(`Analyzing conversational input to implicitly learn profile details: "${input}"`);

    const systemPrompt = `You are a quiet, background user profile learning engine. Analyze the conversational fragment. If the user mentions personal contact info, shipping addresses, resumes, preferred websites, or payment methods, extract it.
Do not hallucinate. Only extract explicitly supplied information.

Respond exactly in this JSON schema:
{
  "extracted": {
    "name": "extracted name or null",
    "email": "extracted email or null",
    "phone": "extracted phone or null",
    "addresses": ["extracted addresses"],
    "favoriteSites": ["domain names"],
    "paymentPreferences": { "key": "value" }
  }
}
If nothing is present, return empty arrays and null values. Respond in valid JSON only.`;

    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: input }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return;

      const parsed = JSON.parse(content);
      const extracted = parsed.extracted;

      if (extracted) {
        // Clean up nulls
        const cleanCard: Partial<UserProfileCard> = {};
        if (extracted.name) cleanCard.name = extracted.name;
        if (extracted.email) cleanCard.email = extracted.email;
        if (extracted.phone) cleanCard.phone = extracted.phone;
        if (extracted.addresses?.length > 0) cleanCard.addresses = extracted.addresses;
        if (extracted.favoriteSites?.length > 0) cleanCard.favoriteSites = extracted.favoriteSites;
        if (extracted.paymentPreferences && Object.keys(extracted.paymentPreferences).length > 0) {
          cleanCard.paymentPreferences = extracted.paymentPreferences;
        }

        if (Object.keys(cleanCard).length > 0) {
          await this.saveProfileCard(userId, cleanCard);
        }
      }
    } catch (error: any) {
      this.logger.error(`Implicit profile learning failed: ${error.message}`);
    }
  }
}
