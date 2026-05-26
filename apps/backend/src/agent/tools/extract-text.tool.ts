import { Injectable, Logger } from '@nestjs/common';
import { Tool } from './tool.interface';
import { BrowserAgentService } from '../browser-agent.service';

@Injectable()
export class ExtractTextTool implements Tool {
  private readonly logger = new Logger(ExtractTextTool.name);
  
  name = 'extract_text';
  description = 'Extracts text from current page or specific selector';

  constructor(private browserAgent: BrowserAgentService) {}

  async execute(input: { selector?: string; page?: any }): Promise<any> {
    try {
      this.logger.log(`📄 Extracting text`);
      
      if (!input.page) {
        throw new Error('Page context required for extract_text');
      }

      const text = await this.browserAgent.extractText(input.page, input.selector);

      return {
        success: true,
        text: text.substring(0, 2000), // limit output
        selector: input.selector,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Extract text failed: ${error}`);
      throw error;
    }
  }
}
