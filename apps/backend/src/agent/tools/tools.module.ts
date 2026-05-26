import { Module } from '@nestjs/common';
import { BrowserAgentService } from '../browser-agent.service';
import { ToolRegistryService } from './tool-registry.service';
import { GoogleSearchTool } from './google-search.tool';
import { OpenUrlTool } from './open-url.tool';
import { ExtractTextTool } from './extract-text.tool';

@Module({
  providers: [
    BrowserAgentService,
    ToolRegistryService,
    GoogleSearchTool,
    OpenUrlTool,
    ExtractTextTool,
  ],
  exports: [BrowserAgentService, ToolRegistryService],
})
export class ToolsModule {
  constructor(
    private registry: ToolRegistryService,
    private googleSearchTool: GoogleSearchTool,
    private openUrlTool: OpenUrlTool,
    private extractTextTool: ExtractTextTool,
  ) {
    this.registry.register(this.googleSearchTool);
    this.registry.register(this.openUrlTool);
    this.registry.register(this.extractTextTool);
  }
}
