import { Injectable, Logger } from '@nestjs/common';
import { DomainAdapter } from './domain-adapter.interface';
import { BrowserProvider } from '../providers/browser-provider.interface';

@Injectable()
export class SwiggyAdapter implements DomainAdapter {
  private readonly logger = new Logger(SwiggyAdapter.name);

  matches(url: string): boolean {
    return url.includes('swiggy.com');
  }

  async executeGoal(
    provider: BrowserProvider,
    sessionId: string,
    goal: string,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    this.logger.log(`Swiggy Domain Adapter triggered for objective: "${goal}"`);

    try {
      await provider.navigate(sessionId, 'https://www.swiggy.com');
      
      const lower = goal.toLowerCase();
      let dish = 'Biryani';
      if (lower.includes('pizza')) dish = 'Pizza';
      if (lower.includes('burger')) dish = 'Burger';

      this.logger.log(`Searching for "${dish}" on Swiggy...`);
      const searchUrl = `https://www.swiggy.com/search?query=${encodeURIComponent(dish)}`;
      await provider.navigate(sessionId, searchUrl);

      return {
        success: true,
        result: {
          message: `Successfully navigated to Swiggy search page for ${dish}`,
          url: searchUrl,
        },
      };
    } catch (error: any) {
      this.logger.error(`Swiggy Adapter failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
