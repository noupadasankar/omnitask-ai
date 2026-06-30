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
export class ResearchDomainAgent extends BaseDomainAgent {
  readonly id = 'research-agent';
  readonly name = 'Research Agent';
  readonly category = 'research' as const;
  readonly description = 'Browse, collect, and synthesize information from the web using multi-source research';
  readonly taskTypes = ['research', 'deep_research', 'fact_check', 'comparison', 'news_analysis'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
    private planner: PlannerAgentService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }

  async buildGraph(goal: ParsedGoal, context: DomainAgentBuildContext): Promise<DomainAgentGraphResult> {
    const plan = await this.planner.createPlan(context.goalText, {
      userId: context.userId,
      userPreferences: context.userPreferences,
    });

    const graph = this.graphService.graphFromLinearPlan(context.goalText, this.category, plan);
    return { graph, plan, pluginIds: [], parallel: false };
  }
}
