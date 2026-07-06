import { Injectable } from '@nestjs/common';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import { BaseDomainAgent } from './base-domain.agent';

@Injectable()
export class ShoppingDomainAgent extends BaseDomainAgent {
  readonly id = 'shopping-agent';
  readonly name = 'Shopping Agent';
  readonly category = 'shopping' as const;
  readonly description = 'Search and compare products across Amazon and Flipkart';
  readonly taskTypes = ['shopping', 'price_comparison'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }
}
