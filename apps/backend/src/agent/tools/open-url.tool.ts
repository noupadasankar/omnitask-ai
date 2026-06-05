import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Tool } from './tool.interface';
import { BrowserAgentService } from '../browser-agent.service';

@Injectable()
export class OpenUrlTool implements Tool {
  private readonly logger = new Logger(OpenUrlTool.name);
  
  name = 'open_url';
  description = 'Opens a URL and returns page content';

  constructor(
    @Inject(forwardRef(() => BrowserAgentService))
    private browserAgent: BrowserAgentService,
  ) {}

  async execute(input: { url: string; selector?: string }): Promise<any> {
    let page: any = null;
    try {
      this.logger.log(`🌐 Opening URL: ${input.url}`);
      
      page = await this.browserAgent.goTo(input.url);
      const content = await this.browserAgent.extractText(page, input.selector);

      return {
        success: true,
        url: input.url,
        content: content.substring(0, 1000), // limit output
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Open URL failed: ${error}`);
      throw error;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }
}
