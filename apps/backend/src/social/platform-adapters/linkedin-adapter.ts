import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LinkedInAdapter {
  private readonly logger = new Logger(LinkedInAdapter.name);

  async publish(content: string, imageUrl?: string): Promise<{ success: boolean; externalId?: string; error?: string }> {
    this.logger.log(`[LinkedIn] Publishing post: "${content.substring(0, 50)}..."`);
    // Playwright automation / OAuth API simulator
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    return {
      success: true,
      externalId: `li_${Math.random().toString(36).substring(2, 11)}`,
    };
  }
}
