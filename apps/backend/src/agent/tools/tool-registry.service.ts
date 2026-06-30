import { Injectable, Logger } from '@nestjs/common';
import { Tool } from './tool.interface';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
    this.logger.log(`🔧 Tool registered: ${tool.name}`);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  async execute(name: string, input: any, context?: any) {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`🔧 Tool not found: ${name}`);
    }

    this.logger.log(`⚙️  Executing tool: ${name}`);
    return tool.execute(input, context);
  }
}
