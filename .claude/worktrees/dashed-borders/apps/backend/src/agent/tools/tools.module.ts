import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agent.module';
import { ToolRegistryService } from './tool-registry.service';
import { GoogleSearchTool } from './google-search.tool';
import { OpenUrlTool } from './open-url.tool';
import { ExtractTextTool } from './extract-text.tool';

@Module({
  imports: [forwardRef(() => AgentModule)],
  providers: [
    ToolRegistryService,
    GoogleSearchTool,
    OpenUrlTool,
    ExtractTextTool,
  ],
  exports: [ToolRegistryService],
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
