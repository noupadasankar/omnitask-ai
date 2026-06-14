import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
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

// Centerpiece services
import { GoalUnderstandingService } from './goal-understanding.service';
import { BrowserSessionService } from './browser-session.service';
import { ApprovalService } from './approval.service';
import { ExecutionMemoryService } from './execution-memory.service';
import { MultiAgentCoordinatorService } from './multi-agent-coordinator.service';
import { TaskReplayService } from './task-replay.service';
import { ScheduledTaskService } from './scheduled-task.service';

import { PuppeteerProvider } from './providers/puppeteer-provider.service';
import { ZomatoAdapter } from './domain-adapters/zomato-adapter.service';
import { SwiggyAdapter } from './domain-adapters/swiggy-adapter.service';

// Skill system & user profile memory
import { UserProfileMemoryService } from './user-profile-memory.service';
import { SkillRegistryService } from './skill-registry.service';
import { SkillRouterService } from '../skills/skill-router.service';
import { AgentRouterService } from './agent-router.service';
import { PlanOrchestratorService } from './runtime/plan-orchestrator.service';
import { RuntimeModule } from './runtime/runtime.module';
import { PluginsModule } from '../plugins/plugins.module';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { JobDomainAgent } from '../agent-registry/agents/job.agent';
import { FoodDomainAgent } from '../agent-registry/agents/food.agent';
import { ShoppingDomainAgent } from '../agent-registry/agents/shopping.agent';
import { TravelDomainAgent } from '../agent-registry/agents/travel.agent';
import { ResearchDomainAgent } from '../agent-registry/agents/research.agent';
import { SocialDomainAgent } from '../agent-registry/agents/social.agent';

// ─── NEW Cognitive OS services ──────────────────────────────────────────────
import { VerifierAgentService } from './verifier-agent.service';
import { ToolRouterService } from './tool-router.service';
import { StrategyMemoryService } from './strategy-memory.service';
import { WorldStateService } from './world-state.service';
import { DriftDetectorService } from './drift-detector.service';
import { ReflectionService } from './reflection.service';
import { ConfidenceNetworkService } from './confidence-network.service';
import { VisionModule } from '../vision/vision.module';
import { SelfHealingService } from './self-healing.service';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [
    MemoryModule,
    ToolsModule,
    QueueModule,
    RuntimeModule,
    PluginsModule,
    VisionModule,
    LearningModule,
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
    // Centerpiece services
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
    SkillRouterService,
    AgentRouterService,
    PlanOrchestratorService,
    AgentRegistryService,
    JobDomainAgent,
    FoodDomainAgent,
    ShoppingDomainAgent,
    TravelDomainAgent,
    ResearchDomainAgent,
    SocialDomainAgent,
    {
      provide: 'BrowserProvider',
      useClass: PuppeteerProvider,
    },
    PuppeteerProvider,
    ZomatoAdapter,
    SwiggyAdapter,
    // ─── NEW: Cognitive OS services ──────────────────────────────────────
    VerifierAgentService,
    ToolRouterService,
    StrategyMemoryService,
    WorldStateService,
    DriftDetectorService,
    ReflectionService,
    ConfidenceNetworkService,
    SelfHealingService,
  ],
  controllers: [AgentController],
  exports: [
    AgentService,
    AgentCoreService,
    ExecutionEngineService,
    BrowserAgentService,
    // Centerpiece exports
    GoalUnderstandingService,
    BrowserSessionService,
    ApprovalService,
    ExecutionMemoryService,
    MultiAgentCoordinatorService,
    TaskReplayService,
    ScheduledTaskService,
    // Skill system & profile memory exports
    UserProfileMemoryService,
    SkillRegistryService,
    SkillRouterService,
    AgentRouterService,
    PlanOrchestratorService,
    AgentRegistryService,
    PuppeteerProvider,
    ZomatoAdapter,
    SwiggyAdapter,
    // ─── NEW: Cognitive OS exports ───────────────────────────────────────
    VerifierAgentService,
    ToolRouterService,
    StrategyMemoryService,
    WorldStateService,
    DriftDetectorService,
    ReflectionService,
    ConfidenceNetworkService,
    SelfHealingService,
  ],
})
export class AgentModule {}
