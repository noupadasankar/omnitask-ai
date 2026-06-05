import { Injectable } from '@nestjs/common';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import { BaseDomainAgent } from './base-domain.agent';

@Injectable()
export class FoodDomainAgent extends BaseDomainAgent {
  readonly id = 'food-agent';
  readonly name = 'Food Agent';
  readonly category = 'food' as const;
  readonly description = 'Order food with price comparison across Swiggy and Zomato';
  readonly taskTypes = ['food_order'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }
}
