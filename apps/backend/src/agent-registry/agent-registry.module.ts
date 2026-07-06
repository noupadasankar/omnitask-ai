import { Module } from '@nestjs/common';
import { PluginsModule } from '../plugins/plugins.module';
import { RuntimeModule } from '../agent/runtime/runtime.module';
import { SkillRouterService } from '../skills/skill-router.service';
import { PlannerAgentService } from '../agent/planner-agent.service';
import { SkillRegistryService } from '../agent/skill-registry.service';
import { UserProfileMemoryService } from '../agent/user-profile-memory.service';
import { MemoryStoreService } from '../agent/memory-store.service';
import { AgentRegistryService } from './agent-registry.service';
import { JobDomainAgent } from './agents/job.agent';
import { FoodDomainAgent } from './agents/food.agent';
import { ShoppingDomainAgent } from './agents/shopping.agent';
import { TravelDomainAgent } from './agents/travel.agent';
import { ResearchDomainAgent } from './agents/research.agent';
import { SocialDomainAgent } from './agents/social.agent';
import { EmailDomainAgent } from './agents/email.agent';
import { MediaDomainAgent } from './agents/media.agent';
import { BookingDomainAgent } from './agents/booking.agent';
import { FinanceDomainAgent } from './agents/finance.agent';
import { FileDomainAgent } from './agents/file.agent';
import { CalendarDomainAgent } from './agents/calendar.agent';

@Module({
  // RuntimeModule provides ExecutionGraphService; every domain agent's
  // BaseDomainAgent constructor depends on it. SkillRouterService is
  // dependency-free and provided locally so the agents can resolve it.
  imports: [PluginsModule, RuntimeModule],
  providers: [
    AgentRegistryService,
    SkillRouterService,
    // Planner chain — required by the research/social/travel agents.
    // All transitive deps (PrismaService, LlmService, EmbeddingService)
    // are provided by @Global modules, so this set is self-contained.
    SkillRegistryService,
    MemoryStoreService,
    UserProfileMemoryService,
    PlannerAgentService,
    JobDomainAgent,
    FoodDomainAgent,
    ShoppingDomainAgent,
    TravelDomainAgent,
    ResearchDomainAgent,
    SocialDomainAgent,
    EmailDomainAgent,
    MediaDomainAgent,
    BookingDomainAgent,
    FinanceDomainAgent,
    FileDomainAgent,
    CalendarDomainAgent,
  ],
  exports: [
    AgentRegistryService,
    BookingDomainAgent,
    FinanceDomainAgent,
    FileDomainAgent,
    CalendarDomainAgent,
  ],
})
export class AgentRegistryModule {}
