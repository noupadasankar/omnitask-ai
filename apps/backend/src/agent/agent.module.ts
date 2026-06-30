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

import { PlaywrightProvider } from './providers/playwright-provider.service';
import { DomainAdaptersModule } from './domain-adapters/domain-adapters.module';

// Skill system & user profile memory
import { UserProfileMemoryService } from './user-profile-memory.service';
import { SkillRegistryService } from './skill-registry.service';
import { SkillRouterService } from '../skills/skill-router.service';
import { AgentRouterService } from './agent-router.service';
import { PlanOrchestratorService } from './runtime/plan-orchestrator.service';
import { RuntimeModule } from './runtime/runtime.module';
import { PluginsModule } from '../plugins/plugins.module';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';

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
import { OrchestratorPipelineService } from './orchestrator-pipeline.service';
import { AgentGroupService } from './group/group.service';
import { AgentMessageBusModule } from './message-bus/message-bus.module';

// ─── WEEK 7: Multi-Agent Orchestration ──────────────────────────────────────
import { SupervisorOrchestratorService } from './orchestration/supervisor-orchestrator.service';
import { SubGoalDecomposerService } from './orchestration/sub-goal-decomposer.service';
import { ResultSynthesizerService } from './orchestration/result-synthesizer.service';

@Module({
  imports: [
    MemoryModule,
    ToolsModule,
    QueueModule,
    RuntimeModule,
    PluginsModule,
    VisionModule,
    LearningModule,
    AgentMessageBusModule,
    AgentRegistryModule,
    DomainAdaptersModule,
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
    // NOTE: SkillRouterService (from ../skills/skill-router.service) has no
    // constructor-injected dependencies — all DomainSkill instances are created
    // with `new` directly inside the class. No SkillsModule exists or is needed.
    UserProfileMemoryService,
    SkillRegistryService,
    SkillRouterService,
    AgentRouterService,
    PlanOrchestratorService,
    {
      provide: 'BrowserProvider',
      useClass: PlaywrightProvider,
    },
    PlaywrightProvider,
    // ─── NEW: Cognitive OS services ──────────────────────────────────────
    VerifierAgentService,
    ToolRouterService,
    StrategyMemoryService,
    WorldStateService,
    DriftDetectorService,
    ReflectionService,
    ConfidenceNetworkService,
    SelfHealingService,
    OrchestratorPipelineService,
    AgentGroupService,
    // ─── WEEK 7: Multi-Agent Orchestration ────────────────────────────────
    SupervisorOrchestratorService,
    SubGoalDecomposerService,
    ResultSynthesizerService,
  ],
  controllers: [AgentController],
  // Only services consumed by modules outside agent/ are exported
  exports: [
    AgentService,          // ExecutionModule (execution-task.worker, execution-step.worker)
    AgentCoreService,      // ExecutionModule (execution-task.worker)
    ExecutionEngineService, // WebsocketModule (agent.gateway)
    BrowserAgentService,   // ToolsModule (extract-text, google-search, open-url tools)
    SkillRouterService,    // AgentRegistryModule domain agents (11 agent files)
    AgentRegistryModule,   // re-exported so consumers can resolve AgentRegistryService
    VerifierAgentService,  // WebsocketModule (worker-step-handler)
    SelfHealingService,    // WebsocketModule (worker-interaction-handler)
  ],
})
export class AgentModule {}
