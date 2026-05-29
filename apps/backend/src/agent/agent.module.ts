import { Module, forwardRef } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentCoreService } from './agent-core.service';
import { CriticService } from './critic.service';
import { BrowserAgentService } from './browser-agent.service';
import { PlannerAgentService } from './planner-agent.service';
import { VisionAgentService } from './vision-agent.service';
import { PolicyEngineService } from './policy-engine.service';
import { ScreenshotStreamerService } from './screenshot-streamer.service';
import { ExecutionEngineService } from './execution-engine.service';
import { AgentController } from './agent.controller';
import { ToolsModule } from './tools/tools.module';
import { MemoryModule } from '../memory/memory.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  imports: [
    MemoryModule,
    ToolsModule,
    forwardRef(() => WebsocketModule),
    forwardRef(() => ExecutionModule),
  ],
  providers: [
    AgentService,
    AgentCoreService,
    CriticService,
    BrowserAgentService,
    PlannerAgentService,
    VisionAgentService,
    PolicyEngineService,
    ScreenshotStreamerService,
    ExecutionEngineService,
  ],
  controllers: [AgentController],
  exports: [
    AgentService,
    AgentCoreService,
    ExecutionEngineService,
    BrowserAgentService,
  ],
})
export class AgentModule {}