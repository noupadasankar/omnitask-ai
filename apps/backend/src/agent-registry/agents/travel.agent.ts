import { Injectable } from '@nestjs/common';
import { ParsedGoal } from '../../agent/goal-understanding.service';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import { PlannerAgentService } from '../../agent/planner-agent.service';
import {
  DomainAgentBuildContext,
  DomainAgentGraphResult,
} from '../domain-agent.interface';
import { BaseDomainAgent } from './base-domain.agent';

@Injectable()
export class TravelDomainAgent extends BaseDomainAgent {
  readonly id = 'travel-agent';
  readonly name = 'Travel Agent';
  readonly category = 'travel' as const;
  readonly description = 'Book flights, hotels, and tickets (plugins coming soon)';
  readonly taskTypes = ['ticket_booking', 'hotel_booking', 'flight_search'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
    private planner: PlannerAgentService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }

  async buildGraph(
    goal: ParsedGoal,
    context: DomainAgentBuildContext,
  ): Promise<DomainAgentGraphResult> {
    const plugins = this.pluginRegistry.getByCategory(this.category);
    if (plugins.length > 0) {
      return super.buildGraph(goal, context);
    }

    const plan = await this.planner.createPlan(context.goalText, {
      userId: context.userId,
      userPreferences: context.userPreferences,
    });
    const graph = this.graphService.graphFromLinearPlan(context.goalText, this.category, plan);
    return { graph, plan, pluginIds: [], parallel: false };
  }
}
