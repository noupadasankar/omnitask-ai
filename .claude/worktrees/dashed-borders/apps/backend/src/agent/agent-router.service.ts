import { Injectable, Logger } from '@nestjs/common';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { DomainAgentCategory } from '../agent-registry/domain-agent.interface';
import { LearningEngineService } from '../learning/learning-engine.service';
import {
  PreferenceMemoryService,
  UserDomainPreferences,
  formatPluginLabel,
} from '../memory/preferences/preference-memory.service';
import { MergedExecutionPlan } from './runtime/execution-graph.interface';
import { ParsedGoal } from './goal-understanding.service';
import { PlannerAgentService } from './planner-agent.service';
import { ExecutionGraphService } from './runtime/execution-graph.service';

export type DomainAgentType = DomainAgentCategory;

export interface AgentRouterContext {
  goal: string;
  userId: string;
  sessionId?: string;
  strategyHints?: string;
  userPreferences?: Record<string, any>;
  preferredSites?: string[];
}

export interface AgentRouterResult {
  domain: DomainAgentType;
  source: 'agent_registry' | 'planner';
  agentId?: string;
  merged: MergedExecutionPlan;
  matchedSkills: string[];
  appliedPreferences?: UserDomainPreferences;
  preferredSitesApplied?: string[];
}

@Injectable()
export class AgentRouterService {
  private readonly logger = new Logger(AgentRouterService.name);

  constructor(
    private agentRegistry: AgentRegistryService,
    private planner: PlannerAgentService,
    private graphService: ExecutionGraphService,
    private preferenceMemory: PreferenceMemoryService,
    private learningEngine: LearningEngineService,
  ) {}

  async route(
    parsedGoal: ParsedGoal,
    context: AgentRouterContext,
  ): Promise<AgentRouterResult> {
    const learnedPrefs = await this.preferenceMemory.getPreferences(context.userId);
    const mergedPrefs: UserDomainPreferences = {
      ...learnedPrefs,
      ...(context.userPreferences as Partial<UserDomainPreferences>),
    };

    const agent = this.agentRegistry.resolve(parsedGoal);

    if (agent) {
      const categoryPrefs = this.preferenceMemory.getPreferredForCategory(
        mergedPrefs,
        agent.category,
      );
      const learnedSites = (
        await this.learningEngine.getRankedSites(context.userId, agent.category)
      ).map((site) => site.site);
      const preferredSites = this.normalizePreferredSites(
        context.preferredSites,
        parsedGoal.preferredWebsites,
        categoryPrefs,
        learnedSites,
      );

      const registryResult = await agent.buildGraph(parsedGoal, {
        goalText: context.goal,
        userId: context.userId,
        userPreferences: mergedPrefs,
        preferredSites,
      });

      registryResult.plan.taskId = registryResult.plan.taskId || '';

      this.logger.log(
        `[AgentRouter] Registry -> ${agent.id} | plugins=[${registryResult.pluginIds.join(', ')}] | parallel=${registryResult.parallel}${preferredSites.length ? ` | preferred=[${preferredSites.join(', ')}]` : ''}`,
      );

      return {
        domain: agent.category,
        source: 'agent_registry',
        agentId: agent.id,
        merged: {
          plan: registryResult.plan,
          graph: registryResult.graph,
        },
        matchedSkills: registryResult.pluginIds,
        appliedPreferences: mergedPrefs,
        preferredSitesApplied: preferredSites,
      };
    }

    const domain = this.inferDomain(parsedGoal);
    this.logger.log(
      `[AgentRouter] No registry agent -> Planner fallback for domain="${domain}"`,
    );

    const plan = await this.planner.createPlan(context.goal, {
      userId: context.userId,
      strategyHints: context.strategyHints,
      userPreferences: context.userPreferences,
    });

    const graph = this.graphService.graphFromLinearPlan(context.goal, domain, plan);
    return {
      domain,
      source: 'planner',
      merged: { plan, graph },
      matchedSkills: [],
      appliedPreferences: mergedPrefs,
      preferredSitesApplied: this.normalizePreferredSites(
        context.preferredSites,
        parsedGoal.preferredWebsites,
      ),
    };
  }

  inferDomain(goal: ParsedGoal): DomainAgentType {
    const map: Record<string, DomainAgentType> = {
      job_search: 'job',
      food_order: 'food',
      shopping: 'shopping',
      price_comparison: 'shopping',
      ticket_booking: 'travel',
      hotel_booking: 'travel',
      flight_search: 'travel',
      research: 'research',
    };
    return map[goal.taskType] || 'general';
  }

  formatPreferenceSummary(
    prefs: UserDomainPreferences,
    category: string,
  ): string[] {
    const sites = this.preferenceMemory.getPreferredForCategory(prefs, category);
    return sites.map(formatPluginLabel);
  }

  private normalizePreferredSites(
    ...groups: Array<string[] | undefined>
  ): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const group of groups) {
      for (const rawSite of group || []) {
        const site = rawSite.trim().toLowerCase();
        if (!site || seen.has(site)) continue;
        seen.add(site);
        ordered.push(site);
      }
    }

    return ordered;
  }
}
