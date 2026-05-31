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
import { MemoryStoreService } from './memory-store.service';

// New Autonomous centerpiece services
import { GoalUnderstandingService } from './goal-understanding.service';
import { BrowserSessionService } from './browser-session.service';
import { ApprovalService } from './approval.service';
import { ExecutionMemoryService } from './execution-memory.service';
import { MultiAgentCoordinatorService } from './multi-agent-coordinator.service';
import { TaskReplayService } from './task-replay.service';
import { ScheduledTaskService } from './scheduled-task.service';

// Advanced Enterprise architectural additions
import { PuppeteerProvider } from './providers/puppeteer-provider.service';
import { ElementExtractionService } from './element-extraction.service';
import { SessionPersistenceService } from './session-persistence.service';
import { ReplanningService } from './replanning.service';
import { ZomatoAdapter } from './domain-adapters/zomato-adapter.service';
import { SwiggyAdapter } from './domain-adapters/swiggy-adapter.service';

// Skill System & User Profile Memory upgrades
import { UserProfileMemoryService } from './user-profile-memory.service';
import { SkillRegistryService } from './skill-registry.service';

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
    MemoryStoreService,
    // New centerpiece services
    GoalUnderstandingService,
    BrowserSessionService,
    ApprovalService,
    ExecutionMemoryService,
    MultiAgentCoordinatorService,
    TaskReplayService,
    ScheduledTaskService,
    // Skill system & profile memory
    UserProfileMemoryService,
    SkillRegistryService,
    // Advanced additions
    {
      provide: 'BrowserProvider',
      useClass: PuppeteerProvider,
    },
    PuppeteerProvider,
    ElementExtractionService,
    SessionPersistenceService,
    ReplanningService,
    ZomatoAdapter,
    SwiggyAdapter,
  ],
  controllers: [AgentController],
  exports: [
    AgentService,
    AgentCoreService,
    ExecutionEngineService,
    BrowserAgentService,
    // Exporting centerpiece services for tasks processor
    GoalUnderstandingService,
    BrowserSessionService,
    ApprovalService,
    ExecutionMemoryService,
    MultiAgentCoordinatorService,
    TaskReplayService,
    ScheduledTaskService,
    // Exporting skill system & profile memory
    UserProfileMemoryService,
    SkillRegistryService,
    // Advanced additions exports
    PuppeteerProvider,
    ElementExtractionService,
    SessionPersistenceService,
    ReplanningService,
    ZomatoAdapter,
    SwiggyAdapter,
  ],
})
export class AgentModule {}