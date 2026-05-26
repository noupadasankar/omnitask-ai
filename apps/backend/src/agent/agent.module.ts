import { Module, forwardRef } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentCoreService } from './agent-core.service';
import { CriticService } from './critic.service';
import { ToolsModule } from './tools/tools.module';
import { MemoryModule } from '../memory/memory.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  imports: [
    ToolsModule,
    MemoryModule,
    WebsocketModule,
    forwardRef(() => ExecutionModule),
  ],
  providers: [AgentService, AgentCoreService, CriticService],
  exports: [AgentService, AgentCoreService],
})
export class AgentModule {}
