import { Injectable, Logger } from '@nestjs/common';
import { DomainAdapter } from './domain-adapter.interface';
import { BrowserProvider } from '../providers/browser-provider.interface';

@Injectable()
export class ZomatoAdapter implements DomainAdapter {
  private readonly logger = new Logger(ZomatoAdapter.name);

  matches(url: string): boolean {
    return url.includes('zomato.com');
  }

  async executeGoal(
    provider: BrowserProvider,
    sessionId: string,
    goal: string,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    this.logger.log(`Zomato Domain Adapter triggered for objective: "${goal}"`);

    try {
      // 1. Navigate to search query
      await provider.navigate(sessionId, 'https://www.zomato.com');
      
      // Let's assume the goal is to search for a dish
      const lower = goal.toLowerCase();
      let dish = 'Biryani';
      if (lower.includes('pizza')) dish = 'Pizza';
      if (lower.includes('burger')) dish = 'Burger';

      // 2. Perform fast deterministic navigation
      this.logger.log(`Searching for "${dish}" on Zomato...`);
      
      // The adapter executes clean structured selector paths
      // In a real execution, we wait and click search box
      // e.g. await provider.type(sessionId, 'input[placeholder*="Search"]', dish);
      // For showcase demo, we simulate navigation to Zomato search URL directly
      const searchUrl = `https://www.zomato.com/ncr/delivery?q=${encodeURIComponent(dish)}`;
      await provider.navigate(sessionId, searchUrl);

      return {
        success: true,
        result: {
          message: `Successfully navigated to Zomato search page for ${dish}`,
          url: searchUrl,
        },
      };
    } catch (error: any) {
      this.logger.error(`Zomato Adapter failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
