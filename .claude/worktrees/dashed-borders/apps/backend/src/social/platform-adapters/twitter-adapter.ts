import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TwitterAdapter {
  private readonly logger = new Logger(TwitterAdapter.name);

  async publish(content: string, imageUrl?: string): Promise<{ success: boolean; externalId?: string; error?: string }> {
    this.logger.log(`[Twitter/X] Publishing post: "${content.substring(0, 50)}..."`);
    // Twitter v2 API / Playwright simulator
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    return {
      success: true,
      externalId: `tw_${Math.random().toString(36).substring(2, 11)}`,
    };
  }
}
