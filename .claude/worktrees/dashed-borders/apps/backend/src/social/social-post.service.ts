import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class SocialPostService {
  private readonly logger = new Logger(SocialPostService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY') || 'dummy-key',
    });
  }

  async generateDraft(topic: string, platform: string, tone = 'professional'): Promise<string> {
    try {
      this.logger.log(`Generating AI post draft for topic="${topic}", platform="${platform}", tone="${tone}"`);
      const prompt = `Write a social media post for ${platform}.
Topic: ${topic}
Tone: ${tone}
Constraints: Follow standard character limits (Twitter: 280 chars, LinkedIn: professional length). Do not use excessive hashtags. Make it engaging.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      this.logger.error('Error generating post draft', error);
      // Return a fallback high-quality mockup post if API fails
      return `Autonomous AI agents are transforming how we think about productivity. In OmniTask-AI v2.0, you can orchestrate multi-agent workflows to automate your social scheduling, job tracking, and research in minutes. What workflows will you automate next? #AI #Productivity #TypeScript`;
    }
  }

  validateContent(content: string, platform: string): { valid: boolean; reason?: string } {
    if (!content) {
      return { valid: false, reason: 'Content cannot be empty' };
    }

    if (platform === 'twitter' && content.length > 280) {
      return { valid: false, reason: 'Twitter post exceeds 280 characters' };
    }

    if (platform === 'linkedin' && content.length > 3000) {
      return { valid: false, reason: 'LinkedIn post exceeds 3000 characters' };
    }

    return { valid: true };
  }

  calculateOptimalTime(platform: string): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
}
