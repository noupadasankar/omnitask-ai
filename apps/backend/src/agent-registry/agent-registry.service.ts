import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ParsedGoal } from '../agent/goal-understanding.service';
import { SitePlugin } from '../plugins/plugin.interface';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import {
  DomainAgent,
  DomainAgentBuildContext,
  DomainAgentGraphResult,
  DomainAgentMetadata,
} from './domain-agent.interface';
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

@Injectable()
export class AgentRegistryService implements OnModuleInit {
  private readonly logger = new Logger(AgentRegistryService.name);
  private agents = new Map<string, DomainAgent>();

  constructor(
    private pluginRegistry: PluginRegistryService,
    private jobAgent: JobDomainAgent,
    private foodAgent: FoodDomainAgent,
    private shoppingAgent: ShoppingDomainAgent,
    private travelAgent: TravelDomainAgent,
    private researchAgent: ResearchDomainAgent,
    private socialAgent: SocialDomainAgent,
    private emailAgent: EmailDomainAgent,
    private mediaAgent: MediaDomainAgent,
    private bookingAgent: BookingDomainAgent,
    private financeAgent: FinanceDomainAgent,
    private fileAgent: FileDomainAgent,
    private calendarAgent: CalendarDomainAgent,
  ) {}

  onModuleInit() {
    [
      this.jobAgent,
      this.foodAgent,
      this.shoppingAgent,
      this.travelAgent,
      this.researchAgent,
      this.socialAgent,
      this.emailAgent,
      this.mediaAgent,
      this.bookingAgent,
      this.financeAgent,
      this.fileAgent,
      this.calendarAgent,
    ].forEach((agent) => this.registerAgent(agent));

    this.logger.log(
      `[AgentRegistry] Loaded ${this.agents.size} domain agents, ${this.pluginRegistry.getAll().length} plugins`,
    );
  }

  /** Register a domain agent at runtime */
  registerAgent(agent: DomainAgent): void {
    this.agents.set(agent.id, agent);
    this.logger.log(`[AgentRegistry] Registered agent: ${agent.id} (${agent.category})`);
  }

  unregisterAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  /** Register an external site plugin (future: npm package) */
  async registerPlugin(plugin: SitePlugin): Promise<void> {
    await this.pluginRegistry.register(plugin);
  }

  /**
   * Resolves the best domain agent for a parsed goal.
   * Agents are checked in registration order — specific domains before research.
   */
  resolve(goal: ParsedGoal): DomainAgent | null {
    for (const agent of this.agents.values()) {
      if (agent.canHandle(goal)) {
        this.logger.log(`[AgentRegistry] Resolved → ${agent.id} for taskType="${goal.taskType}"`);
        return agent;
      }
    }
    return null;
  }

  async buildGraph(
    goal: ParsedGoal,
    context: DomainAgentBuildContext,
  ): Promise<DomainAgentGraphResult | null> {
    const agent = this.resolve(goal);
    if (!agent) return null;
    return agent.buildGraph(goal, context);
  }

  getAgent(agentId: string): DomainAgent | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): DomainAgentMetadata[] {
    return [...this.agents.values()].map((agent) => {
      const plugins = this.pluginRegistry.getByCategory(agent.category);
      return {
        id: agent.id,
        name: agent.name,
        category: agent.category,
        description: agent.description,
        taskTypes: agent.taskTypes,
        pluginCount: plugins.length,
        plugins: plugins.map((p) => p.id),
      };
    });
  }

  listPlugins() {
    return this.pluginRegistry.listMetadata();
  }
}
