import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Tool } from './tool.interface';
import { BrowserAgentService } from '../browser-agent.service';

@Injectable()
export class GoogleSearchTool implements Tool {
  private readonly logger = new Logger(GoogleSearchTool.name);
  
  name = 'google_search';
  description = 'Searches Google and returns top 5 results';

  constructor(
    @Inject(forwardRef(() => BrowserAgentService))
    private browserAgent: BrowserAgentService,
  ) {}

  async execute(input: { query: string }): Promise<any> {
    try {
      this.logger.log(`🔍 Searching Google for: ${input.query}`);
      
      const results = await this.browserAgent.searchGoogle(input.query);

      return {
        success: true,
        query: input.query,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Google search failed: ${error}`);
      throw error;
    }
  }
}
